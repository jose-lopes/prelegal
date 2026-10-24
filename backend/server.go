package main

import (
	"context"
	"database/sql"
	"net/http"
	"time"
)

func newHandler(db *sql.DB, staticDir string, chat http.Handler) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		w.Header().Set("Content-Type", "application/json")
		if err := db.PingContext(ctx); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte("{\"status\":\"unavailable\"}\n"))
			return
		}
		w.Write([]byte("{\"status\":\"ok\"}\n"))
	})
	mux.HandleFunc("/api/", http.NotFound)
	mux.Handle("POST /api/chat", chat)
	mux.Handle("/", http.FileServer(http.Dir(staticDir)))
	return mux
}
