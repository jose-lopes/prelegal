package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/voocel/litellm"
	"github.com/voocel/litellm/provider/openrouter"
)

func draft() ndaForm {
	return ndaForm{TermMode: "fixed", ConfidentialityMode: "fixed"}
}

func requestBody(form ndaForm) string {
	body, _ := json.Marshal(chatRequest{Form: form, Messages: []chatMessage{{Role: "user", Content: "Our company is Acme."}}})
	return string(body)
}

type httpDoer func(*http.Request) (*http.Response, error)

func (f httpDoer) Do(r *http.Request) (*http.Response, error) { return f(r) }

func TestChatOpenRouterIntegration(t *testing.T) {
	form := draft()
	form.Party1.Company = "Acme"
	result := chatResponse{Reply: "Who is the other party?", Form: form}
	output, _ := json.Marshal(result)
	provider, err := openrouter.New(openrouter.Config{
		APIKey: "test-secret",
		HTTPClient: httpDoer(func(r *http.Request) (*http.Response, error) {
			if r.URL.String() != "https://openrouter.ai/api/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer test-secret" {
				t.Fatalf("unexpected destination or authorization")
			}
			var wire struct {
				Model    string `json:"model"`
				Provider struct {
					Only              []string `json:"only"`
					AllowFallbacks    bool     `json:"allow_fallbacks"`
					RequireParameters bool     `json:"require_parameters"`
				} `json:"provider"`
				Tools []struct {
					Function struct {
						Name   string          `json:"name"`
						Strict bool            `json:"strict"`
						Schema json.RawMessage `json:"parameters"`
					} `json:"function"`
				} `json:"tools"`
				ToolChoice struct {
					Function struct {
						Name string `json:"name"`
					} `json:"function"`
				} `json:"tool_choice"`
				Messages []chatMessage `json:"messages"`
			}
			if err := json.NewDecoder(r.Body).Decode(&wire); err != nil {
				t.Fatal(err)
			}
			if wire.Model != chatModel || len(wire.Provider.Only) != 1 || wire.Provider.Only[0] != "nvidia" || wire.Provider.AllowFallbacks || !wire.Provider.RequireParameters {
				t.Fatalf("incorrect routing: %+v", wire)
			}
			if len(wire.Tools) != 1 || wire.Tools[0].Function.Name != "update_nda" || !wire.Tools[0].Function.Strict || !json.Valid(wire.Tools[0].Function.Schema) || wire.ToolChoice.Function.Name != "update_nda" {
				t.Fatal("strict structured output missing")
			}
			if len(wire.Messages) != 3 || wire.Messages[0].Role != "system" || !strings.Contains(wire.Messages[2].Content, `"termMode":"fixed"`) {
				t.Fatalf("missing instructions or current form: %+v", wire.Messages)
			}
			if _, ok := r.Context().Deadline(); !ok {
				t.Fatal("upstream request has no deadline")
			}
			envelope, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{"id": "call_1", "type": "function", "function": map[string]any{"name": "update_nda", "arguments": string(output)}}}}, "finish_reason": "tool_calls"}}})
			return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"application/json"}}, Body: io.NopCloser(strings.NewReader(string(envelope)))}, nil
		}),
	})
	if err != nil {
		t.Fatal(err)
	}
	client, err := litellm.New(provider)
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	chatHandler(client).ServeHTTP(response, httptest.NewRequest("POST", "/api/chat", strings.NewReader(requestBody(draft()))))
	if response.Code != 200 || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("%d %s", response.Code, response.Body.String())
	}
	var got chatResponse
	if err := json.Unmarshal(response.Body.Bytes(), &got); err != nil || got != result {
		t.Fatalf("unexpected response: %+v, %v", got, err)
	}
}

type chatFunc func(context.Context, litellm.Request) (*litellm.Response, error)

func (f chatFunc) Chat(ctx context.Context, r litellm.Request) (*litellm.Response, error) {
	return f(ctx, r)
}

func TestChatRejectsBadRequestsBeforeCallingAI(t *testing.T) {
	client := chatFunc(func(context.Context, litellm.Request) (*litellm.Response, error) {
		t.Fatal("unexpected AI call")
		return nil, nil
	})
	for _, body := range []string{
		`{`, `null`, `{}`, requestBody(draft()) + `{}`,
		strings.Replace(requestBody(draft()), `"user"`, `"system"`, 1),
		strings.Replace(requestBody(draft()), `Our company is Acme.`, ` `, 1),
		strings.Replace(requestBody(draft()), `Our company is Acme.`, strings.Repeat("a", 8001), 1),
		strings.Replace(requestBody(draft()), `"termMode":"fixed"`, `"termMode":"invalid"`, 1),
	} {
		response := httptest.NewRecorder()
		chatHandler(client).ServeHTTP(response, httptest.NewRequest("POST", "/api/chat", strings.NewReader(body)))
		if response.Code != 400 {
			t.Fatalf("bad request returned %d", response.Code)
		}
	}
	response := httptest.NewRecorder()
	chatHandler(client).ServeHTTP(response, httptest.NewRequest("POST", "/api/chat", strings.NewReader(`{"messages":[{"role":"user","content":"`+strings.Repeat("a", 256<<10)+`"}]}`)))
	if response.Code != 413 {
		t.Fatalf("oversized request returned %d", response.Code)
	}
}

func TestChatFailures(t *testing.T) {
	valid, _ := json.Marshal(chatResponse{Reply: "Tell me more.", Form: draft()})
	for _, tc := range []struct {
		name, text string
		finish     litellm.FinishReason
		err        error
		status     int
	}{
		{"provider", "", "", errors.New("secret upstream error"), 502},
		{"timeout", "", "", context.DeadlineExceeded, 504},
		{"malformed", "not JSON", litellm.FinishReasonToolCall, nil, 502},
		{"missing form", `{"reply":"Hello"}`, litellm.FinishReasonToolCall, nil, 502},
		{"truncated", string(valid), litellm.FinishReasonLength, nil, 502},
		{"bad date", strings.Replace(string(valid), `"effectiveDate":""`, `"effectiveDate":"2026-02-30"`, 1), litellm.FinishReasonToolCall, nil, 502},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := chatFunc(func(context.Context, litellm.Request) (*litellm.Response, error) {
				return &litellm.Response{Blocks: []litellm.Block{litellm.ToolUseBlock{ID: "call_1", Name: "update_nda", Arguments: tc.text}}, FinishReason: tc.finish}, tc.err
			})
			response := httptest.NewRecorder()
			chatHandler(client).ServeHTTP(response, httptest.NewRequest("POST", "/api/chat", strings.NewReader(requestBody(draft()))))
			if response.Code != tc.status || strings.Contains(response.Body.String(), "secret") {
				t.Fatalf("%d %s", response.Code, response.Body.String())
			}
		})
	}
	client, err := newChatClient("")
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	chatHandler(client).ServeHTTP(response, httptest.NewRequest("POST", "/api/chat", strings.NewReader(requestBody(draft()))))
	if response.Code != 503 {
		t.Fatalf("missing key: %d %s", response.Code, response.Body.String())
	}
}

func TestDraftValidation(t *testing.T) {
	if !validDraft(draft()) {
		t.Fatal("empty draft rejected")
	}
	for _, form := range []ndaForm{
		{TermMode: "fixed", ConfidentialityMode: "fixed", GoverningLaw: "Portugal"},
		{TermMode: "fixed", ConfidentialityMode: "fixed", TermYears: "0"},
		{TermMode: "fixed", ConfidentialityMode: "fixed", TermYears: "1.5"},
		{TermMode: "fixed", ConfidentialityMode: "fixed", TermYears: "9007199254740992"},
		{TermMode: "fixed", ConfidentialityMode: "fixed", EffectiveDate: "0000-01-01"},
	} {
		if validDraft(form) {
			t.Fatalf("invalid draft accepted: %+v", form)
		}
	}
}
