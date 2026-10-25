package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func accountServer(t *testing.T) (*sql.DB, http.Handler) {
	t.Helper()
	db, cleanup, err := openDatabase(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(cleanup)
	return db, newHandler(db, t.TempDir(), chatHandler(nil))
}

func apiRequest(handler http.Handler, method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	if cookie != nil {
		request.AddCookie(cookie)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func register(t *testing.T, handler http.Handler, email string) *http.Cookie {
	t.Helper()
	response := apiRequest(handler, "POST", "/api/auth/signup", fmt.Sprintf(`{"email":%q,"password":"a long test password"}`, email), nil)
	if response.Code != 200 {
		t.Fatalf("register: %d %s", response.Code, response.Body)
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteLaxMode || cookies[0].Path != "/" {
		t.Fatalf("session cookie: %v", cookies)
	}
	return cookies[0]
}

func TestAccountsAndSessions(t *testing.T) {
	db, handler := accountServer(t)
	cookie := register(t, handler, "  Owner@Example.com  ")
	response := apiRequest(handler, "GET", "/api/auth/session", "", cookie)
	if response.Code != 200 || !strings.Contains(response.Body.String(), "owner@example.com") {
		t.Fatalf("session: %d %s", response.Code, response.Body)
	}
	var hash, salt []byte
	if err := db.QueryRow("SELECT password_hash, password_salt FROM users").Scan(&hash, &salt); err != nil {
		t.Fatal(err)
	}
	if len(hash) != 32 || len(salt) != 16 || strings.Contains(string(hash), "password") {
		t.Fatal("password is not stored as a salted key")
	}
	var storedToken []byte
	if err := db.QueryRow("SELECT token_hash FROM sessions").Scan(&storedToken); err != nil {
		t.Fatal(err)
	}
	tokenHash := sha256.Sum256([]byte(cookie.Value))
	if string(storedToken) != string(tokenHash[:]) {
		t.Fatal("session token is not hashed at rest")
	}
	for _, tc := range []struct {
		path, body string
		code       int
	}{
		{"signup", `{"email":"OWNER@example.com","password":"a long test password"}`, 409},
		{"signup", `{"email":"invalid","password":"a long test password"}`, 400},
		{"signup", `{"email":"test@example.com","password":"short"}`, 400},
		{"signin", `{"email":"owner@example.com","password":"incorrect password"}`, 401},
		{"signin", `{"email":"missing@example.com","password":"incorrect password"}`, 401},
		{"signin", `{"email":"owner@example.com","password":"a long test password","extra":true}`, 400},
	} {
		result := apiRequest(handler, "POST", "/api/auth/"+tc.path, tc.body, nil)
		if result.Code != tc.code {
			t.Errorf("%s: %d %s", tc.path, result.Code, result.Body)
		}
	}
	if response := apiRequest(handler, "POST", "/api/auth/signout", "", cookie); response.Code != 204 || response.Result().Cookies()[0].MaxAge != -1 {
		t.Fatalf("signout: %d", response.Code)
	}
	if response := apiRequest(handler, "GET", "/api/auth/session", "", cookie); response.Code != 401 {
		t.Fatal("signed out session still works")
	}
	signin := apiRequest(handler, "POST", "/api/auth/signin", `{"email":"owner@example.com","password":"a long test password"}`, nil)
	if signin.Code != 200 {
		t.Fatalf("signin: %s", signin.Body)
	}
	fresh := signin.Result().Cookies()[0]
	if fresh.Value == cookie.Value {
		t.Fatal("session token was reused")
	}
	if _, err := db.Exec("UPDATE sessions SET expires_at = 0"); err != nil {
		t.Fatal(err)
	}
	if response := apiRequest(handler, "GET", "/api/auth/session", "", fresh); response.Code != 401 {
		t.Fatal("expired session accepted")
	}
}

func savedInput(t *testing.T, title string) string {
	t.Helper()
	fields := draftFields{}
	for _, field := range documents["mutual-nda"].Fields {
		fields[field.ID] = ""
	}
	fields["party1.company"] = "Private Acme"
	body, err := json.Marshal(map[string]any{"documentId": "mutual-nda", "title": title, "fields": fields})
	if err != nil {
		t.Fatal(err)
	}
	return string(body)
}

func TestAgreementOwnershipAndValidation(t *testing.T) {
	_, handler := accountServer(t)
	owner := register(t, handler, "owner@example.com")
	other := register(t, handler, "other@example.com")
	body := savedInput(t, "Acme draft")
	create := apiRequest(handler, "POST", "/api/agreements", body, owner)
	if create.Code != 201 {
		t.Fatalf("save: %d %s", create.Code, create.Body)
	}
	for _, tc := range []struct {
		method, path string
		cookie       *http.Cookie
		code         int
	}{
		{"GET", "/api/agreements", nil, 401},
		{"GET", "/api/agreements/1", nil, 401},
		{"POST", "/api/agreements", nil, 401},
		{"PUT", "/api/agreements/1", nil, 401},
		{"POST", "/api/chat", nil, 401},
		{"GET", "/api/agreements/1", other, 404},
		{"PUT", "/api/agreements/1", other, 404},
		{"GET", "/api/agreements/999", owner, 404},
		{"PUT", "/api/agreements/999", owner, 404},
	} {
		response := apiRequest(handler, tc.method, tc.path, body, tc.cookie)
		if response.Code != tc.code {
			t.Errorf("%s %s: %d %s", tc.method, tc.path, response.Code, response.Body)
		}
	}
	if list := apiRequest(handler, "GET", "/api/agreements", "", other); strings.TrimSpace(list.Body.String()) != "[]" {
		t.Fatalf("leaked documents: %s", list.Body)
	}
	if response := apiRequest(handler, "PUT", "/api/agreements/1", savedInput(t, "Renamed draft"), owner); response.Code != 204 {
		t.Fatalf("update: %s", response.Body)
	}
	fetched := apiRequest(handler, "GET", "/api/agreements/1", "", owner)
	var item savedAgreement
	if err := json.Unmarshal(fetched.Body.Bytes(), &item); err != nil {
		t.Fatal(err)
	}
	if item.Title != "Renamed draft" || item.Fields["party1.company"] != "Private Acme" || item.CreatedAt == "" {
		t.Fatalf("restored: %+v", item)
	}
	list := apiRequest(handler, "GET", "/api/agreements", "", owner)
	if strings.Contains(list.Body.String(), "Private Acme") || !strings.Contains(list.Body.String(), "Renamed draft") {
		t.Fatalf("history: %s", list.Body)
	}
	for _, invalid := range []string{`{}`, strings.Replace(body, "mutual-nda", "unknown", 1), strings.Replace(body, `"party1.company":"Private Acme"`, `"extra":"x"`, 1), savedInput(t, ""), savedInput(t, strings.Repeat("x", 181)), body + `{}`} {
		if response := apiRequest(handler, "POST", "/api/agreements", invalid, owner); response.Code != 400 {
			t.Errorf("accepted invalid document: %s => %d", invalid, response.Code)
		}
	}
}

func TestCrossOriginProtection(t *testing.T) {
	_, handler := accountServer(t)
	for _, path := range []string{"/api/auth/signup", "/api/auth/signin", "/api/auth/signout", "/api/agreements", "/api/chat"} {
		request := httptest.NewRequest("POST", "http://example.com"+path, strings.NewReader(`{}`))
		request.Header.Set("Origin", "https://attacker.example")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != 403 {
			t.Errorf("cross-origin %s: %d", path, response.Code)
		}
	}
}

func TestConcurrentDocumentSaves(t *testing.T) {
	_, handler := accountServer(t)
	cookie := register(t, handler, "writer@example.com")
	body := savedInput(t, "Parallel draft")
	var group sync.WaitGroup
	for range 6 {
		group.Go(func() {
			if response := apiRequest(handler, "POST", "/api/agreements", body, cookie); response.Code != 201 {
				t.Errorf("concurrent save: %d %s", response.Code, response.Body)
			}
		})
	}
	group.Wait()
	var items []savedAgreement
	response := apiRequest(handler, "GET", "/api/agreements", "", cookie)
	if err := json.Unmarshal(response.Body.Bytes(), &items); err != nil {
		t.Fatal(err)
	}
	if len(items) != 6 {
		t.Fatalf("saved %d documents", len(items))
	}
}

func TestSessionReplacementAndTLSCookie(t *testing.T) {
	_, handler := accountServer(t)
	previous := register(t, handler, "tls@example.com")
	request := httptest.NewRequest("POST", "https://example.com/api/auth/signin", strings.NewReader(`{"email":"tls@example.com","password":"a long test password"}`))
	request.AddCookie(previous)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != 200 {
		t.Fatalf("sign in: %d %s", response.Code, response.Body)
	}
	cookie := response.Result().Cookies()[0]
	if !cookie.Secure || cookie.Value == previous.Value || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("TLS session cookie or cache policy incorrect")
	}
	if result := apiRequest(handler, "GET", "/api/auth/session", "", previous); result.Code != 401 {
		t.Fatal("previous session still valid")
	}
	if result := apiRequest(handler, "GET", "/api/auth/session", "", cookie); result.Code != 200 {
		t.Fatal("replacement session invalid")
	}
}

func TestUnicodePasswordLength(t *testing.T) {
	_, handler := accountServer(t)
	for index, password := range []string{strings.Repeat("é", 11), strings.Repeat("é", 12), strings.Repeat("é", 128), strings.Repeat("é", 129)} {
		body, err := json.Marshal(map[string]string{"email": fmt.Sprintf("unicode%d@example.com", index), "password": password})
		if err != nil {
			t.Fatal(err)
		}
		response := apiRequest(handler, "POST", "/api/auth/signup", string(body), nil)
		want := 200
		if index == 0 || index == 3 {
			want = 400
		}
		if response.Code != want {
			t.Errorf("unicode password length %d: %d %s", index, response.Code, response.Body)
		}
	}
}
