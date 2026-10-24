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
	_, err = db.ExecContext(ctx, `CREATE TABLE users (
		id INTEGER PRIMARY KEY,
		email TEXT NOT NULL UNIQUE,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		cleanup()
		return nil, nil, fmt.Errorf("initialize database: %w", err)
	}
	return db, cleanup, nil
}
