package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestHTTPRoutes(t *testing.T) {
	db, cleanup, err := openDatabase(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer cleanup()
	dir := t.TempDir()
	for name, content := range map[string]string{"index.html": "<h1>Prelegal</h1>", "asset.js": "console.log('app')"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	handler := newHandler(db, dir)
	for _, tc := range []struct {
		path   string
		status int
		body   string
	}{
		{"/", 200, "<h1>Prelegal</h1>"},
		{"/asset.js", 200, "console.log('app')"},
		{"/missing.js", 404, "404 page not found\n"},
		{"/api/missing", 404, "404 page not found\n"},
		{"/api/health", 200, "{\"status\":\"ok\"}\n"},
	} {
		t.Run(tc.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, tc.path, nil))
			if response.Code != tc.status || response.Body.String() != tc.body {
				t.Fatalf("response: %d %q", response.Code, response.Body.String())
			}
		})
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	if response.Code != 503 || response.Body.String() != "{\"status\":\"unavailable\"}\n" || response.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("unavailable database: %d %s", response.Code, response.Body.String())
	}
}
