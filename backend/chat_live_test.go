package main

import (
	"encoding/json"
	"net/http/httptest"
	"os"
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
	input := chatRequest{Form: draft()}
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
		t.Logf("turn %d: %s", i+1, result.Reply)
		if i == 0 && !strings.Contains(result.Reply, "?") {
			t.Fatal("assistant did not ask for the missing details")
		}
		if i == 0 && (result.Form.Party1.Company != "Acme Research, Inc." || result.Form.Party2.Company != "Studio North, LLC" || result.Form.Party1.Name != "" || result.Form.EffectiveDate != "") {
			t.Fatalf("unexpected extraction: %+v", result.Form)
		}
		if i == 1 && (result.Form.Party1.Name != "Alex Smith" || result.Form.Party2.Name != "Robin Jones" || result.Form.EffectiveDate != "2026-10-24" || result.Form.TermYears != "2" || result.Form.ConfidentialityYears != "3" || result.Form.GoverningLaw != "Delaware" || result.Form.Jurisdiction == "") {
			t.Fatalf("incomplete extraction: %+v", result.Form)
		}
		if i == 2 {
			want := input.Form
			want.Party2.Company = "North Research, LLC"
			if result.Form != want {
				t.Fatalf("correction changed unrelated values: got %+v, want %+v", result.Form, want)
			}
		}
		input.Form = result.Form
		input.Messages = append(input.Messages, chatMessage{Role: "assistant", Content: result.Reply})
	}
}
