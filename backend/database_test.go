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
	if _, err := db.Exec("INSERT INTO users (email) VALUES (?)", "demo@example.com"); err != nil {
		t.Fatal(err)
	}
	var id int
	var created string
	if err := db.QueryRow("SELECT id, created_at FROM users").Scan(&id, &created); err != nil || id != 1 || created == "" {
		t.Fatalf("user defaults: id=%d, created_at=%q, err=%v", id, created, err)
	}
	if _, err := db.Exec("INSERT INTO users (email) VALUES (?)", "demo@example.com"); err == nil {
		t.Fatal("duplicate email accepted")
	}
	cleanup()
	fresh, closeFresh, err := openDatabase(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer closeFresh()
	if err := fresh.QueryRow("SELECT COUNT(*) FROM users").Scan(&count); err != nil || count != 0 {
		t.Fatalf("restarted users table: count=%d, err=%v", count, err)
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
