package main

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"
)

const sessionCookie = "prelegal_session"

type account struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
}

type accountAPI struct{ db *sql.DB }

func (api accountAPI) authenticate(w http.ResponseWriter, r *http.Request, next func(http.ResponseWriter, *http.Request, account)) {
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		chatError(w, http.StatusUnauthorized, "Please sign in to continue.")
		return
	}
	hash := sha256.Sum256([]byte(cookie.Value))
	var user account
	err = api.db.QueryRowContext(r.Context(), `SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?`, hash[:], time.Now().Unix()).Scan(&user.ID, &user.Email)
	if errors.Is(err, sql.ErrNoRows) {
		chatError(w, http.StatusUnauthorized, "Your session has ended. Please sign in again.")
		return
	}
	if err != nil {
		chatError(w, http.StatusInternalServerError, "Unable to check your session. Please retry.")
		return
	}
	next(w, r, user)
}

func (api accountAPI) protected(next func(http.ResponseWriter, *http.Request, account)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) { api.authenticate(w, r, next) }
}

func passwordKey(password string, salt []byte) ([]byte, error) {
	return pbkdf2.Key(sha256.New, password, salt, 600000, 32)
}

func (api accountAPI) credentials(signup bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if decodeJSON(http.MaxBytesReader(w, r.Body, 4096), &input) != nil {
			chatError(w, http.StatusBadRequest, "Enter a valid email and password.")
			return
		}
		input.Email = strings.ToLower(strings.TrimSpace(input.Email))
		address, err := mail.ParseAddress(input.Email)
		passwordLength := utf8.RuneCountInString(input.Password)
		if err != nil || address.Address != input.Email || len(input.Email) > 254 || passwordLength < 12 || passwordLength > 128 {
			chatError(w, http.StatusBadRequest, "Use a valid email and a password between 12 and 128 characters.")
			return
		}
		user := account{Email: input.Email}
		var salt, stored []byte
		if signup {
			salt = make([]byte, 16)
			rand.Read(salt)
		} else {
			err = api.db.QueryRowContext(r.Context(), "SELECT id, password_hash, password_salt FROM users WHERE email = ?", input.Email).Scan(&user.ID, &stored, &salt)
			if err != nil && !errors.Is(err, sql.ErrNoRows) {
				chatError(w, http.StatusInternalServerError, "Unable to sign in. Please retry.")
				return
			}
			// Unknown accounts still perform password derivation.
			if errors.Is(err, sql.ErrNoRows) {
				salt = make([]byte, 16)
			}
		}
		key, err := passwordKey(input.Password, salt)
		if err != nil {
			chatError(w, http.StatusInternalServerError, "Unable to process your password.")
			return
		}
		if signup {
			result, err := api.db.ExecContext(r.Context(), "INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING", input.Email, key, salt)
			if err != nil {
				chatError(w, http.StatusInternalServerError, "Unable to create your account. Please retry.")
				return
			}
			count, err := result.RowsAffected()
			if err != nil {
				chatError(w, http.StatusInternalServerError, "Unable to create your account.")
				return
			}
			if count == 0 {
				chatError(w, http.StatusConflict, "An account with this email already exists. Sign in instead.")
				return
			}
			user.ID, err = result.LastInsertId()
			if err != nil {
				chatError(w, http.StatusInternalServerError, "Unable to create your account.")
				return
			}
		} else if subtle.ConstantTimeCompare(key, stored) != 1 {
			chatError(w, http.StatusUnauthorized, "Email or password is incorrect.")
			return
		}
		token := make([]byte, 32)
		rand.Read(token)
		value := hex.EncodeToString(token)
		hash := sha256.Sum256([]byte(value))
		expires := time.Now().Add(7 * 24 * time.Hour)
		_, err = api.db.ExecContext(r.Context(), "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", hash[:], user.ID, expires.Unix())
		if err != nil {
			chatError(w, http.StatusInternalServerError, "Unable to start your session. Please sign in again.")
			return
		}
		// Replace this browser's previous session when switching accounts.
		if previous, err := r.Cookie(sessionCookie); err == nil {
			oldHash := sha256.Sum256([]byte(previous.Value))
			if _, err := api.db.ExecContext(r.Context(), "DELETE FROM sessions WHERE token_hash = ?", oldHash[:]); err != nil {
				chatError(w, http.StatusInternalServerError, "Unable to replace your session. Please retry.")
				return
			}
		}
		http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: value, Path: "/", HttpOnly: true, Secure: r.TLS != nil, SameSite: http.SameSiteLaxMode, Expires: expires, MaxAge: 7 * 24 * 60 * 60})
		json.NewEncoder(w).Encode(user)
	}
}

func (api accountAPI) signout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		hash := sha256.Sum256([]byte(cookie.Value))
		if _, err := api.db.ExecContext(r.Context(), "DELETE FROM sessions WHERE token_hash = ?", hash[:]); err != nil {
			chatError(w, http.StatusInternalServerError, "Unable to sign out. Please retry.")
			return
		}
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Path: "/", HttpOnly: true, Secure: r.TLS != nil, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	w.WriteHeader(http.StatusNoContent)
}
