package main

import (
	_ "embed"
	"encoding/json"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

//go:embed documents.json
var documentJSON []byte

// The same registry is read by the frontend build and embedded in the server.
type fieldDefinition struct {
	ID        string   `json:"id"`
	Label     string   `json:"label"`
	Group     string   `json:"group"`
	Type      string   `json:"type,omitempty"`
	Choices   []string `json:"choices,omitempty"`
	Optional  bool     `json:"optional,omitempty"`
	AllowNone bool     `json:"allowNone,omitempty"`
	When      *struct {
		Field string `json:"field"`
		Value string `json:"value"`
	} `json:"when,omitempty"`
}
type documentDefinition struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Description  string            `json:"description"`
	Roles        []string          `json:"roles"`
	Version      string            `json:"version"`
	Fields       []fieldDefinition `json:"fields"`
	Instructions string            `json:"instructions"`
}

var documents = func() map[string]documentDefinition {
	var definitions []documentDefinition
	if err := json.Unmarshal(documentJSON, &definitions); err != nil {
		panic(err)
	}
	result := make(map[string]documentDefinition, len(definitions))
	for _, definition := range definitions {
		result[definition.ID] = definition
	}
	return result
}()

type draftFields map[string]string
type fieldValue struct {
	ID    string `json:"id"`
	Value string `json:"value"`
}

var wholeYears = regexp.MustCompile(`^[1-9][0-9]*$`)
var percentage = regexp.MustCompile(`^(?:\d+(?:\.\d+)?)%?$`)

func validField(field fieldDefinition, value string) bool {
	if value == "" {
		return true
	}
	if len(value) > 32000 {
		return false
	}
	if len(field.Choices) > 0 {
		for _, choice := range field.Choices {
			if choice == value {
				return true
			}
		}
		return false
	}
	switch field.Type {
	case "date":
		_, err := time.Parse("2006-01-02", value)
		return err == nil && !strings.HasPrefix(value, "0000")
	case "years":
		n, err := strconv.ParseUint(value, 10, 64)
		return err == nil && wholeYears.MatchString(value) && n <= 9007199254740991
	case "percent":
		n, err := strconv.ParseFloat(strings.TrimSuffix(value, "%"), 64)
		return err == nil && percentage.MatchString(value) && n > 0 && n <= 100
	case "us-state":
		const states = "|Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|District of Columbia|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|"
		return strings.Contains(states, "|"+value+"|")
	}
	return true
}

func validDocumentDraft(id string, fields draftFields) bool {
	definition, ok := documents[id]
	if !ok || len(fields) != len(definition.Fields) {
		return false
	}
	for _, field := range definition.Fields {
		value, present := fields[field.ID]
		if !present || !validField(field, value) {
			return false
		}
	}
	return true
}

func decodeFields(id string, fields []fieldValue) (draftFields, bool) {
	if id == "" {
		return nil, len(fields) == 0
	}
	result := make(draftFields, len(fields))
	for _, field := range fields {
		if _, duplicate := result[field.ID]; duplicate {
			return nil, false
		}
		result[field.ID] = field.Value
	}
	return result, validDocumentDraft(id, result)
}

func documentSchema() []byte {
	ids := []string{""}
	forms := []any{map[string]any{"type": "object", "properties": map[string]any{}, "required": []string{}, "additionalProperties": false}}
	for id := range documents {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids[1:] {
		properties := map[string]any{}
		required := []string{}
		for _, field := range documents[id].Fields {
			property := map[string]any{"type": "string", "description": field.Label}
			if len(field.Choices) > 0 {
				property["enum"] = append([]string{""}, field.Choices...)
			}
			properties[field.ID] = property
			required = append(required, field.ID)
		}
		forms = append(forms, map[string]any{"type": "object", "properties": properties, "required": required, "additionalProperties": false})
	}
	schema := map[string]any{
		"type": "object", "additionalProperties": false,
		"required": []string{"reply", "documentId", "suggestedDocumentId", "fields"},
		"properties": map[string]any{
			"reply":               map[string]any{"type": "string"},
			"documentId":          map[string]any{"type": "string", "enum": ids},
			"suggestedDocumentId": map[string]any{"type": "string", "enum": ids},
			"fields":              map[string]any{"anyOf": forms},
		},
	}
	encoded, err := json.Marshal(schema)
	if err != nil {
		panic(err)
	}
	return encoded
}
