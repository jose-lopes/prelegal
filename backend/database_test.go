package main

import (
	"context"
	"testing"
)

func TestDatabaseLifecycle(t *testing.T) {
	db, cleanup, err := openDatabase(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(cleanup)
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count); err != nil || count != 0 {
		t.Fatalf("new users table: count=%d, err=%v", count, err)
	}
	if _, err := db.Exec("INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)", "demo@example.com", []byte("hash"), []byte("salt")); err != nil {
		t.Fatal(err)
	}
	var id int
	var created string
	if err := db.QueryRow("SELECT id, created_at FROM users").Scan(&id, &created); err != nil || id != 1 || created == "" {
		t.Fatalf("user defaults: id=%d, created_at=%q, err=%v", id, created, err)
	}
	if _, err := db.Exec("INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)", "demo@example.com", []byte("hash"), []byte("salt")); err == nil {
		t.Fatal("duplicate email accepted")
	}
	if _, err := db.Exec("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, 1, 9999999999)", []byte("token")); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("INSERT INTO agreements (user_id, document_id, title, fields) VALUES (1, 'mutual-nda', 'Draft', '{}')"); err != nil {
		t.Fatal(err)
	}
	cleanup()
	fresh, closeFresh, err := openDatabase(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer closeFresh()
	for _, table := range []string{"users", "sessions", "agreements"} {
		if err := fresh.QueryRow("SELECT COUNT(*) FROM " + table).Scan(&count); err != nil || count != 0 {
			t.Fatalf("restarted %s table: count=%d, err=%v", table, count, err)
		}
	}
}

func TestDatabaseInitializationFailure(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if db, cleanup, err := openDatabase(ctx); err == nil {
		cleanup()
		t.Fatalf("initialization succeeded with canceled context: %v", db)
	}
}
