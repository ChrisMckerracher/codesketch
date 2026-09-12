package cli

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

const rawReplyText = "  Reply text\nwith spacing  "
const commentReplyJSON = `{"id":"reply-1","requestId":"req-1","author":"agent","text":"  Reply text\nwith spacing  ","at":"2026-09-09T00:02:00Z"}`

func stateWithReply() string {
	return strings.Replace(stateJSON, `"request":null}`, `"request":null,"replies":[`+commentReplyJSON+`]}`, 1)
}

func commentsWithReply() string {
	return strings.Replace(commentsEnvelopeJSON,
		`"request":{"id":"req-1","fingerprint":"fp-1"}`,
		`"request":{"id":"req-1","fingerprint":"fp-1"},"replies":[`+commentReplyJSON+`]`, 1)
}

func TestCommentsReplyValidationNeverRequests(t *testing.T) {
	var requests atomic.Int32
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.Write([]byte(stateWithReply()))
	}))
	defer s.Close()
	longText, longRequestID := strings.Repeat("x", 2001), strings.Repeat("x", 81)
	cases := [][]string{
		{"comments", "list", "--request-id", "r1"},
		{"comments", "wait", "--request-id", "r1"},
		{"comments", "reply", "c-1", "text", "--generation", "g1", "--seq", "1"},
		{"comments", "reply", "c-1", "text", "--seq", "1", "--request-id", "r1"},
		{"comments", "reply", "c-1", "text", "--generation", "g1", "--request-id", "r1"},
		{"comments", "reply", "c-1", "text", "--generation", "g1", "--seq", "1", "--request-id", ""},
		{"comments", "reply", "c-1", "text", "--generation", "g1", "--seq", "1", "--request-id", longRequestID},
		{"comments", "reply", "c-1", " ", "--generation", "g1", "--seq", "1", "--request-id", "r1"},
		{"comments", "reply", "c-1", longText, "--generation", "g1", "--seq", "1", "--request-id", "r1"},
		{"comments", "reply", "", "text", "--generation", "g1", "--seq", "1", "--request-id", "r1"},
		{"comments", "reply", "c-1", "text", "--generation", "g1", "--seq", "0", "--request-id", "r1"},
		{"comments", "reply", "c-1", "text", "--generation", "g1", "--seq", "1", "--request-id", "r1", "--epoch", "0"},
		{"comments", "reply", "c-1", "text", "--generation", "g1", "--seq", "1", "--request-id", "r1", "--request-id", "r2"},
		{"comments", "reply", "c-1", "text", "extra", "--generation", "g1", "--seq", "1", "--request-id", "r1"},
	}
	for _, args := range cases {
		args = append(args, "--json")
		code, out, stderr := runTest(context.Background(), s.URL, "", args...)
		var detail map[string]string
		if code != 2 || out != "" || json.Unmarshal([]byte(stderr), &detail) != nil || detail["error"] != "USAGE" {
			t.Errorf("%v: exit=%d stdout=%s stderr=%s", args, code, out, stderr)
		}
	}
	if requests.Load() != 0 {
		t.Fatalf("invalid reply invocation made %d requests", requests.Load())
	}
}

func TestCommentsReplyPostsExactAgentPayload(t *testing.T) {
	var requests atomic.Int32
	var path, method string
	var body map[string]any
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		path, method = r.URL.Path, r.Method
		if r.Method == "POST" {
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
		}
		w.Write([]byte(stateWithReply()))
	}))
	defer s.Close()

	args := []string{"comments", "reply", "  c-1  ", rawReplyText, "--generation", "g1", "--seq", "1", "--request-id", "req-1"}
	code, out, stderr := runTest(context.Background(), s.URL, "", args...)
	if code != 0 || stderr != "" || method != "POST" || path != "/api/comments/reply" {
		t.Fatalf("reply: %d %s %s %s %s", code, out, stderr, method, path)
	}
	if len(body) != 6 || body["id"] != "c-1" || body["text"] != rawReplyText || body["source"] != "agent" ||
		body["expectedDocGeneration"] != "g1" || body["expectedSeq"] != 1.0 || body["requestId"] != "req-1" {
		t.Fatalf("reply body: %+v", body)
	}
	if !strings.Contains(out, "Reply to comment c-1: [agent] "+rawReplyText) {
		t.Fatalf("human reply output omitted actual reply: %s", out)
	}

	code, out, stderr = runTest(context.Background(), s.URL, "", append(args, "--json")...)
	if code != 0 || stderr != "" {
		t.Fatalf("JSON reply: %d %s %s", code, out, stderr)
	}
	var state map[string]any
	if err := json.Unmarshal([]byte(out), &state); err != nil {
		t.Fatal(err)
	}
	comments := state["comments"].([]any)
	replies := comments[0].(map[string]any)["replies"].([]any)
	if len(replies) != 1 || replies[0].(map[string]any)["requestId"] != "req-1" || replies[0].(map[string]any)["text"] != rawReplyText {
		t.Fatalf("JSON reply missing actual record: %s", out)
	}
	if requests.Load() != 2 {
		t.Fatalf("expected one request per reply invocation, got %d", requests.Load())
	}
}

func TestCommentsReplyAppearsInListAndWaitOutput(t *testing.T) {
	s := commentsStaticServer(commentsWithReply())
	defer s.Close()
	want := "Reply to comment c-1: [agent] " + rawReplyText + " (id reply-1, requestId req-1, at 2026-09-09T00:02:00Z)"
	for _, args := range [][]string{{"comments", "list"}, {"comments", "wait", "--timeout", "5"}, {"comments", "watch", "--timeout", "0.1"}} {
		code, out, stderr := runTest(context.Background(), s.URL, "", args...)
		if code != 0 || stderr != "" || !strings.Contains(out, want) {
			t.Errorf("%v: %d %s %s", args, code, out, stderr)
		}
	}
	for _, args := range [][]string{{"comments", "list", "--json"}, {"comments", "wait", "--timeout", "5", "--json"}} {
		code, out, stderr := runTest(context.Background(), s.URL, "", args...)
		if code != 0 || stderr != "" {
			t.Fatalf("%v: %d %s", args, code, stderr)
		}
		var env map[string]any
		if err := json.Unmarshal([]byte(out), &env); err != nil {
			t.Fatal(err)
		}
		comments := env["comments"].([]any)
		replies := comments[0].(map[string]any)["replies"].([]any)
		if len(replies) != 1 || replies[0].(map[string]any)["id"] != "reply-1" {
			t.Fatalf("%v: actual reply missing: %s", args, out)
		}
	}
}

func TestCommentsReplyHelpAndCompletion(t *testing.T) {
	_, help, err := runTest(context.Background(), "bad-url", "", "help", "comments")
	if err != "" {
		t.Fatal(err)
	}
	for _, want := range []string{"reply ID TEXT --generation STRING --seq N --request-id ID", "1..2000", "1..80"} {
		if !strings.Contains(help, want) {
			t.Errorf("help missing %q: %s", want, help)
		}
	}
	for _, shell := range []string{"bash", "zsh"} {
		script, err := completion(shell)
		if err != nil {
			t.Fatal(err)
		}
		for _, want := range []string{"reply", "--request-id"} {
			if !strings.Contains(script, want) {
				t.Errorf("%s completion missing %q", shell, want)
			}
		}
	}
	fish, fishErr := completion("fish")
	if fishErr != nil {
		t.Fatal(fishErr)
	}
	if !strings.Contains(fish, "address reply") || !strings.Contains(fish, "-l request-id") {
		t.Errorf("fish completion missing reply action or request ID flag")
	}
}

func TestCommentReplyResponseValidation(t *testing.T) {
	longText := strings.Repeat("x", 2001)
	longReplyJSON := strings.Replace(commentReplyJSON, `  Reply text\nwith spacing  `, longText, 1)
	cases := map[string]string{
		"unknown author": strings.Replace(commentsWithReply(), `"author":"agent"`, `"author":"robot"`, 1),
		"extra field":    strings.Replace(commentsWithReply(), `"at":"2026-09-09T00:02:00Z"`, `"at":"2026-09-09T00:02:00Z","extra":true`, 1),
		"long text":      strings.Replace(commentsWithReply(), commentReplyJSON, longReplyJSON, 1),
		"duplicate id":   strings.Replace(commentsWithReply(), `"replies":[`+commentReplyJSON+`]`, `"replies":[`+commentReplyJSON+`,`+commentReplyJSON+`]`, 1),
	}
	for name, data := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := decodeCommentsEnvelope([]byte(data)); err == nil {
				t.Fatalf("accepted invalid reply response")
			}
		})
	}
}

func TestCommentRepliesNullIsRejectedInEveryResponseShape(t *testing.T) {
	nullEnvelope := strings.Replace(commentsWithReply(), `"replies":[`+commentReplyJSON+`]`, `"replies":null`, 1)
	nullSnapshot := strings.Replace(stateWithReply(), `"replies":[`+commentReplyJSON+`]`, `"replies":null`, 1)
	if _, err := decodeCommentsEnvelope([]byte(nullEnvelope)); err == nil {
		t.Fatal("accepted null replies in comments envelope")
	}
	if _, err := decodeSnapshot([]byte(nullSnapshot)); err == nil {
		t.Fatal("accepted null replies in snapshot")
	}
}

func TestAcknowledgedAgentReplyRequiresExactSubmittedPayload(t *testing.T) {
	comments := []commentRecord{{ID: "c-1", Replies: []commentReply{
		{ID: "r-1", RequestID: "req-1", Author: "human", Text: rawReplyText, At: "2026-09-09T00:02:00Z"},
		{ID: "r-2", RequestID: "req-2", Author: "agent", Text: "different", At: "2026-09-09T00:02:00Z"},
	}}}
	if _, ok := acknowledgedAgentReply(comments, "c-1", "req-1", rawReplyText); ok {
		t.Fatal("accepted human reply as acknowledged agent reply")
	}
	if _, ok := acknowledgedAgentReply(comments, "c-1", "req-2", rawReplyText); ok {
		t.Fatal("accepted reply with mismatched text")
	}
}
