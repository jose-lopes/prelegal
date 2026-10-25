package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// Each process gets a new database; no application data survives a restart.
func openDatabase(ctx context.Context) (*sql.DB, func(), error) {
	dir, err := os.MkdirTemp("", "prelegal-")
	if err != nil {
		return nil, nil, fmt.Errorf("create database directory: %w", err)
	}
	db, err := sql.Open("sqlite", filepath.Join(dir, "prelegal.db"))
	if err != nil {
		os.RemoveAll(dir)
		return nil, nil, fmt.Errorf("open database: %w", err)
	}
	cleanup := func() {
		db.Close()
		os.RemoveAll(dir)
	}
	// Serialize SQLite access so concurrent requests do not contend for writes.
	db.SetMaxOpenConns(1)
	_, err = db.ExecContext(ctx, `CREATE TABLE users (
		id INTEGER PRIMARY KEY,
		email TEXT NOT NULL UNIQUE,
		password_hash BLOB NOT NULL,
		password_salt BLOB NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE sessions (
		token_hash BLOB PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id),
		expires_at INTEGER NOT NULL
	);
	CREATE TABLE agreements (
		id INTEGER PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id),
		document_id TEXT NOT NULL,
		title TEXT NOT NULL,
		fields TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX agreements_by_user ON agreements(user_id, updated_at);
	`)
	if err != nil {
		cleanup()
		return nil, nil, fmt.Errorf("initialize database: %w", err)
	}
	return db, cleanup, nil
}
