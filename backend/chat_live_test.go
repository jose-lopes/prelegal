package main

import (
	"context"
	"encoding/json"
	"github.com/voocel/litellm"
	"maps"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
)

// Opt in explicitly: this sends only synthetic agreement details to OpenRouter.
func TestLiveChat(t *testing.T) {
	if os.Getenv("PRELEGAL_LIVE_AI") != "1" {
		t.Skip("set PRELEGAL_LIVE_AI=1 and OPENROUTER_PM_API_KEY for live integration")
	}
	if os.Getenv("OPENROUTER_PM_API_KEY") == "" {
		t.Fatal("OPENROUTER_PM_API_KEY is required")
	}
	client, err := newChatClient(os.Getenv("OPENROUTER_PM_API_KEY"))
	if err != nil {
		t.Fatal(err)
	}
	client = traceLiveClient(t, client)
	input := chatRequest{DocumentID: "mutual-nda", Drafts: map[string]draftFields{"mutual-nda": draft()}}
	for i, text := range []string{
		"We are Acme Research, Inc., discussing a research partnership with Studio North, LLC.",
		"Acme signatory is Alex Smith, CEO, notices alex@example.com. Studio North signatory is Robin Jones, Director, notices robin@example.com. Purpose: evaluating a research partnership. Effective date October 24, 2026. Agreement lasts two years. Confidentiality lasts three years. Delaware governing law, courts in New Castle County, Delaware. No modifications.",
		"Correct only the second party's legal name to North Research, LLC. Keep everything else unchanged.",
	} {
		input.Messages = append(input.Messages, chatMessage{Role: "user", Content: text})
		body, err := json.Marshal(input)
		if err != nil {
			t.Fatal(err)
		}
		response := httptest.NewRecorder()
		chatHandler(client).ServeHTTP(response, httptest.NewRequest("POST", "/api/chat", strings.NewReader(string(body))))
		if response.Code != 200 {
			t.Fatalf("turn %d: %d %s", i+1, response.Code, response.Body.String())
		}
		var result chatResponse
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		fields, ok := decodeFields(result.DocumentID, result.Fields)
		if !ok {
			t.Fatal("invalid fields")
		}
		t.Logf("turn %d: %s", i+1, result.Reply)
		if i == 0 && !strings.Contains(result.Reply, "?") {
			t.Fatal("assistant did not ask for the missing details")
		}
		if i == 0 && (fields["party1.company"] != "Acme Research, Inc." || fields["party2.company"] != "Studio North, LLC" || fields["party1.name"] != "" || fields["effectiveDate"] != "") {
			t.Fatalf("unexpected extraction: %+v", fields)
		}
		if i == 1 && (fields["party1.name"] != "Alex Smith" || fields["party2.name"] != "Robin Jones" || fields["effectiveDate"] != "2026-10-24" || fields["termYears"] != "2" || fields["confidentialityYears"] != "3" || fields["governingLaw"] != "Delaware" || fields["jurisdiction"] == "") {
			t.Fatalf("incomplete extraction: %+v", fields)
		}
		if i == 2 {
			want := maps.Clone(input.Drafts["mutual-nda"])
			want["party2.company"] = "North Research, LLC"
			if !reflect.DeepEqual(fields, want) {
				t.Fatalf("correction changed unrelated values: got %+v, want %+v", fields, want)
			}
		}
		input.Drafts["mutual-nda"] = fields
		input.Messages = append(input.Messages, chatMessage{Role: "assistant", Content: result.Reply})
	}
}

func TestLiveDocumentRouting(t *testing.T) {
	if os.Getenv("PRELEGAL_LIVE_AI") != "1" {
		t.Skip("set PRELEGAL_LIVE_AI=1 for synthetic live AI integration")
	}
	client, err := newChatClient(os.Getenv("OPENROUTER_PM_API_KEY"))
	if err != nil || client == nil {
		t.Fatal("OPENROUTER_PM_API_KEY is required")
	}
	client = traceLiveClient(t, client)
	input := chatRequest{Drafts: map[string]draftFields{}}
	for id, definition := range documents {
		fields := draftFields{}
		for _, field := range definition.Fields {
			fields[field.ID] = ""
		}
		input.Drafts[id] = fields
	}
	input.Drafts["mutual-nda"] = draft()
	for i, step := range []struct{ message, wantID string }{
		{"I need an AI Addendum. Provider is Acme AI, Inc. Customer is North Research, LLC. Model training is not permitted.", "ai-addendum"},
		{"Can you generate an employment contract for a new staff member?", "ai-addendum"},
		{"Yes, use the supported Professional Services Agreement instead. Provider is Consulting Studio, LLC and Customer is Research Client, Inc.", "professional-services-agreement"},
	} {
		input.Messages = append(input.Messages, chatMessage{Role: "user", Content: step.message})
		body, err := json.Marshal(input)
		if err != nil {
			t.Fatal(err)
		}
		response := httptest.NewRecorder()
		chatHandler(client).ServeHTTP(response, httptest.NewRequest("POST", "/api/chat", strings.NewReader(string(body))))
		if response.Code != 200 {
			t.Fatalf("turn %d: %d %s", i+1, response.Code, response.Body.String())
		}
		var result chatResponse
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		fields, ok := decodeFields(result.DocumentID, result.Fields)
		if !ok || result.DocumentID != step.wantID {
			t.Fatalf("incorrect routing: %+v", result)
		}
		t.Logf("turn %d: %s", i+1, result.Reply)
		if i == 0 && (fields["party1.company"] != "Acme AI, Inc." || fields["trainingPermission"] != "not permitted") {
			t.Fatalf("incorrect extraction: %+v", fields)
		}
		if i == 1 && (result.SuggestedDocumentID == "" || !reflect.DeepEqual(fields, input.Drafts[input.DocumentID]) || !strings.Contains(result.Reply, "?")) {
			t.Fatalf("unsupported request did not preserve draft and seek acceptance: %+v", result)
		}
		if i == 2 && fields["party1.company"] != "Consulting Studio, LLC" {
			t.Fatalf("incorrect selected draft: %+v", fields)
		}
		input.DocumentID = result.DocumentID
		input.Drafts[result.DocumentID] = fields
		input.Messages = append(input.Messages, chatMessage{Role: "assistant", Content: result.Reply})
	}
}

// Diagnostics are restricted to opt-in tests using synthetic data.
func traceLiveClient(t *testing.T, client chatClient) chatClient {
	return chatFunc(func(ctx context.Context, request litellm.Request) (*litellm.Response, error) {
		response, err := client.Chat(ctx, request)
		if err == nil {
			for _, call := range response.ToolCalls() {
				var result documentUpdate
				parseErr := json.Unmarshal([]byte(call.Arguments), &result)
				valid := result.DocumentID == "" && len(result.Fields) == 0 || validDocumentDraft(result.DocumentID, result.Fields)
				if parseErr != nil || !valid {
					t.Logf("invalid synthetic output: finish=%s tool=%s arguments=%s", response.FinishReason, call.Name, call.Arguments)
				}
			}
		}
		return response, err
	})
}
