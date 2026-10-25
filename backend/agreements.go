package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"
)

type savedAgreement struct {
	ID         int64       `json:"id"`
	DocumentID string      `json:"documentId"`
	Title      string      `json:"title"`
	Fields     draftFields `json:"fields,omitempty"`
	CreatedAt  string      `json:"createdAt"`
	UpdatedAt  string      `json:"updatedAt"`
}

func (api accountAPI) listAgreements(w http.ResponseWriter, r *http.Request, user account) {
	rows, err := api.db.QueryContext(r.Context(), "SELECT id, document_id, title, created_at, updated_at FROM agreements WHERE user_id = ? ORDER BY updated_at DESC, id DESC", user.ID)
	if err != nil {
		chatError(w, http.StatusInternalServerError, "Unable to load your documents. Please retry.")
		return
	}
	defer rows.Close()
	items := []savedAgreement{}
	for rows.Next() {
		var item savedAgreement
		if err := rows.Scan(&item.ID, &item.DocumentID, &item.Title, &item.CreatedAt, &item.UpdatedAt); err != nil {
			chatError(w, http.StatusInternalServerError, "Unable to load your documents.")
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		chatError(w, http.StatusInternalServerError, "Unable to load your documents.")
		return
	}
	json.NewEncoder(w).Encode(items)
}

func (api accountAPI) getAgreement(w http.ResponseWriter, r *http.Request, user account) {
	var item savedAgreement
	var fields string
	err := api.db.QueryRowContext(r.Context(), "SELECT id, document_id, title, fields, created_at, updated_at FROM agreements WHERE id = ? AND user_id = ?", r.PathValue("id"), user.ID).Scan(&item.ID, &item.DocumentID, &item.Title, &fields, &item.CreatedAt, &item.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		chatError(w, http.StatusNotFound, "Document not found.")
		return
	}
	if err != nil {
		chatError(w, http.StatusInternalServerError, "Unable to open this document.")
		return
	}
	if err := json.Unmarshal([]byte(fields), &item.Fields); err != nil {
		chatError(w, http.StatusInternalServerError, "Unable to read this document.")
		return
	}
	json.NewEncoder(w).Encode(item)
}

func (api accountAPI) saveAgreement(w http.ResponseWriter, r *http.Request, user account) {
	var input struct {
		DocumentID string      `json:"documentId"`
		Title      string      `json:"title"`
		Fields     draftFields `json:"fields"`
	}
	if decodeJSON(http.MaxBytesReader(w, r.Body, 1<<20), &input) != nil || !validDocumentDraft(input.DocumentID, input.Fields) {
		chatError(w, http.StatusBadRequest, "Invalid document details.")
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" || utf8.RuneCountInString(input.Title) > 180 {
		chatError(w, http.StatusBadRequest, "Give your document a name of up to 180 characters.")
		return
	}
	fields, err := json.Marshal(input.Fields)
	if err != nil {
		chatError(w, http.StatusInternalServerError, "Unable to prepare your document.")
		return
	}
	if r.Method == http.MethodPost {
		result, err := api.db.ExecContext(r.Context(), "INSERT INTO agreements (user_id, document_id, title, fields) VALUES (?, ?, ?, ?)", user.ID, input.DocumentID, input.Title, string(fields))
		if err != nil {
			chatError(w, http.StatusInternalServerError, "Unable to save your document. Please retry.")
			return
		}
		id, err := result.LastInsertId()
		if err != nil {
			chatError(w, http.StatusInternalServerError, "Unable to save your document.")
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]int64{"id": id})
		return
	}
	result, err := api.db.ExecContext(r.Context(), "UPDATE agreements SET title = ?, fields = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND document_id = ?", input.Title, string(fields), r.PathValue("id"), user.ID, input.DocumentID)
	if err != nil {
		chatError(w, http.StatusInternalServerError, "Unable to save your document. Please retry.")
		return
	}
	count, err := result.RowsAffected()
	if err != nil {
		chatError(w, http.StatusInternalServerError, "Unable to save your document.")
		return
	}
	if count == 0 {
		chatError(w, http.StatusNotFound, "Document not found.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
