package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

func newHandler(db *sql.DB, staticDir string, chat http.Handler) http.Handler {
	mux := http.NewServeMux()
	api := accountAPI{db: db}
	mux.HandleFunc("POST /api/auth/signup", api.credentials(true))
	mux.HandleFunc("POST /api/auth/signin", api.credentials(false))
	mux.HandleFunc("POST /api/auth/signout", api.signout)
	mux.HandleFunc("GET /api/auth/session", api.protected(func(w http.ResponseWriter, r *http.Request, user account) { json.NewEncoder(w).Encode(user) }))
	mux.HandleFunc("GET /api/agreements", api.protected(api.listAgreements))
	mux.HandleFunc("GET /api/agreements/{id}", api.protected(api.getAgreement))
	mux.HandleFunc("POST /api/agreements", api.protected(api.saveAgreement))
	mux.HandleFunc("PUT /api/agreements/{id}", api.protected(api.saveAgreement))
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
	mux.HandleFunc("POST /api/chat", api.protected(func(w http.ResponseWriter, r *http.Request, _ account) { chat.ServeHTTP(w, r) }))
	mux.Handle("/", http.FileServer(http.Dir(staticDir)))
	protected := http.NewCrossOriginProtection().Handler(mux)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Content-Type", "application/json")
		}
		protected.ServeHTTP(w, r)
	})
}
