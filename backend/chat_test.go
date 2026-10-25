package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"maps"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/voocel/litellm"
	"github.com/voocel/litellm/provider/openrouter"
)

func draft() draftFields {
	fields := draftFields{}
	for _, field := range documents["mutual-nda"].Fields {
		fields[field.ID] = ""
	}
	fields["termMode"] = "fixed"
	fields["confidentialityMode"] = "fixed"
	return fields
}

func resultFor(id string, fields draftFields, reply string) chatResponse {
	result := chatResponse{Reply: reply, DocumentID: id, Fields: []fieldValue{}}
	for _, field := range documents[id].Fields {
		result.Fields = append(result.Fields, fieldValue{ID: field.ID, Value: fields[field.ID]})
	}
	return result
}

func providerUpdate(result chatResponse) documentUpdate {
	fields := draftFields{}
	for _, field := range result.Fields {
		fields[field.ID] = field.Value
	}
	return documentUpdate{Reply: result.Reply, DocumentID: result.DocumentID, SuggestedDocumentID: result.SuggestedDocumentID, Fields: fields}
}

func requestBody(fields draftFields) string {
	body, _ := json.Marshal(chatRequest{DocumentID: "mutual-nda", Drafts: map[string]draftFields{"mutual-nda": fields}, Messages: []chatMessage{{Role: "user", Content: "Our company is Acme."}}})
	return string(body)
}

type httpDoer func(*http.Request) (*http.Response, error)

func (f httpDoer) Do(r *http.Request) (*http.Response, error) { return f(r) }

func TestChatOpenRouterIntegration(t *testing.T) {
	form := draft()
	form["party1.company"] = "Acme"
	result := resultFor("mutual-nda", form, "Who is the other party?")
	output, _ := json.Marshal(providerUpdate(result))
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
			if len(wire.Tools) != 1 || wire.Tools[0].Function.Name != "update_document" || !wire.Tools[0].Function.Strict || !json.Valid(wire.Tools[0].Function.Schema) || wire.ToolChoice.Function.Name != "update_document" {
				t.Fatal("strict structured output missing")
			}
			if len(wire.Messages) != 3 || wire.Messages[0].Role != "system" || !strings.Contains(wire.Messages[2].Content, `"termMode":"fixed"`) {
				t.Fatalf("missing instructions or current form: %+v", wire.Messages)
			}
			if _, ok := r.Context().Deadline(); !ok {
				t.Fatal("upstream request has no deadline")
			}
			envelope, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{"id": "call_1", "type": "function", "function": map[string]any{"name": "update_document", "arguments": string(output)}}}}, "finish_reason": "tool_calls"}}})
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
	if err := json.Unmarshal(response.Body.Bytes(), &got); err != nil || !reflect.DeepEqual(got, result) {
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
	valid, _ := json.Marshal(providerUpdate(resultFor("mutual-nda", draft(), "Tell me more.")))
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
				return &litellm.Response{Blocks: []litellm.Block{litellm.ToolUseBlock{ID: "call_1", Name: "update_document", Arguments: tc.text}}, FinishReason: tc.finish}, tc.err
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
	if !validDocumentDraft("mutual-nda", draft()) {
		t.Fatal("empty draft rejected")
	}
	for key, value := range map[string]string{"governingLaw": "Portugal", "termYears": "0", "confidentialityYears": "9007199254740992", "effectiveDate": "0000-01-01"} {
		fields := draft()
		fields[key] = value
		if validDocumentDraft("mutual-nda", fields) {
			t.Fatalf("invalid %s accepted", key)
		}
	}
}

func TestAllDocumentUpdates(t *testing.T) {
	for id, definition := range documents {
		t.Run(id, func(t *testing.T) {
			fields := draftFields{}
			for _, field := range definition.Fields {
				fields[field.ID] = ""
			}
			input := chatRequest{DocumentID: id, Drafts: map[string]draftFields{id: fields}, Messages: []chatMessage{{Role: "user", Content: "Our company is Acme."}}}
			body, err := json.Marshal(input)
			if err != nil {
				t.Fatal(err)
			}
			updated := maps.Clone(fields)
			updated["party1.company"] = "Acme"
			expected := resultFor(id, updated, "Who signs for Acme?")
			arguments, err := json.Marshal(providerUpdate(expected))
			if err != nil {
				t.Fatal(err)
			}
			client := chatFunc(func(context.Context, litellm.Request) (*litellm.Response, error) {
				return &litellm.Response{Blocks: []litellm.Block{litellm.ToolUseBlock{ID: "call_1", Name: "update_document", Arguments: string(arguments)}}, FinishReason: litellm.FinishReasonToolCall}, nil
			})
			response := httptest.NewRecorder()
			chatHandler(client).ServeHTTP(response, httptest.NewRequest("POST", "/api/chat", strings.NewReader(string(body))))
			if response.Code != 200 {
				t.Fatalf("%d %s", response.Code, response.Body.String())
			}
			var result chatResponse
			if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(result, expected) {
				t.Fatalf("unexpected update: %+v", result)
			}
		})
	}
}

func TestDocumentSpecificValues(t *testing.T) {
	cases := []struct {
		id, key, value string
		valid          bool
	}{
		{"mutual-nda", "governingLaw", "Portugal", false},
		{"pilot-agreement", "governing-law", "Portugal", true},
		{"ai-addendum", "trainingPermission", "permitted", true},
		{"ai-addendum", "trainingPermission", "maybe", false},
		{"service-level-agreement", "target-uptime", "99.9%", true},
		{"service-level-agreement", "target-uptime", "100.1%", false},
		{"service-level-agreement", "target-uptime", "0", false},
		{"mutual-nda", "effectiveDate", "2028-02-29", true},
		{"mutual-nda", "effectiveDate", "2026-02-29", false},
		{"mutual-nda", "termYears", "1.5", false},
	}
	for _, tc := range cases {
		t.Run(tc.id+"/"+tc.key+"/"+tc.value, func(t *testing.T) {
			for _, field := range documents[tc.id].Fields {
				if field.ID == tc.key {
					if got := validField(field, tc.value); got != tc.valid {
						t.Fatalf("validField=%v, want %v", got, tc.valid)
					}
					return
				}
			}
			t.Fatal("missing field")
		})
	}
}

func TestRejectInvalidDocumentUpdates(t *testing.T) {
	input := chatRequest{DocumentID: "mutual-nda", Drafts: map[string]draftFields{"mutual-nda": draft()}}
	for _, change := range []func(*chatResponse){
		func(r *chatResponse) { r.DocumentID = "employment-contract" },
		func(r *chatResponse) { r.Fields = append(r.Fields, r.Fields[0]) },
		func(r *chatResponse) { r.Fields[0].ID = "invented-field" },
		func(r *chatResponse) { r.Fields = r.Fields[1:] },
		func(r *chatResponse) { r.SuggestedDocumentID = "unsupported" },
		func(r *chatResponse) {
			r.SuggestedDocumentID = "pilot-agreement"
			r.Fields[0].Value = "Overwrite draft"
		},
	} {
		result := resultFor("mutual-nda", draft(), "Reply")
		change(&result)
		if validChatResult(input, result) {
			t.Fatalf("invalid response accepted: %+v", result)
		}
	}
	for _, state := range []chatRequest{
		{DocumentID: "unknown"},
		{Drafts: map[string]draftFields{"unsupported": {}}},
		{Drafts: map[string]draftFields{"mutual-nda": {"invented": "value"}}},
	} {
		if validChatState(state) {
			t.Fatal("invalid state accepted")
		}
	}
}

func TestUnsupportedSuggestionsPreserveDraftAndAllowAcceptance(t *testing.T) {
	fields := draft()
	fields["party1.company"] = "Keep this company"
	input := chatRequest{DocumentID: "mutual-nda", Drafts: map[string]draftFields{"mutual-nda": fields}}
	suggestion := resultFor("mutual-nda", fields, "We cannot generate employment contracts. A Professional Services Agreement can document independent services. Would that help?")
	suggestion.SuggestedDocumentID = "professional-services-agreement"
	if !validChatResult(input, suggestion) {
		t.Fatal("suggestion rejected")
	}
	target := draftFields{}
	for _, field := range documents[suggestion.SuggestedDocumentID].Fields {
		target[field.ID] = ""
	}
	input.Drafts[suggestion.SuggestedDocumentID] = target
	accepted := resultFor(suggestion.SuggestedDocumentID, target, "Who are the provider and customer?")
	if !validChatResult(input, accepted) {
		t.Fatal("accepted alternative rejected")
	}
	empty := chatRequest{}
	suggestion = resultFor("", nil, "We cannot generate a lease. What is the intended use?")
	if !validChatResult(empty, suggestion) {
		t.Fatal("unselected clarification rejected")
	}
}
