package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/capture"
)

type forbiddenArtistInput struct{ t *testing.T }

func (in forbiddenArtistInput) Read([]byte) (int, error) {
	in.t.Fatal("offline invocation read stdin")
	return 0, nil
}
func (in forbiddenArtistInput) Close() error {
	in.t.Fatal("offline invocation closed stdin")
	return nil
}

func runArtistOffline(t *testing.T, args ...string) (int, string, string) {
	t.Helper()
	var out, stderr bytes.Buffer
	r := Runner{
		In: forbiddenArtistInput{t}, Out: &out, Err: &stderr,
		Env: func(key string) string {
			t.Fatalf("offline invocation consulted environment %s", key)
			return ""
		},
		Capture: func(context.Context, json.RawMessage, capture.Options) (capture.Result, error) {
			t.Fatal("offline invocation attempted capture")
			return capture.Result{}, nil
		},
	}
	code := r.Run(context.Background(), args)
	return code, out.String(), stderr.String()
}

func TestArtistSkillCompleteOfflineBundle(t *testing.T) {
	t.Setenv("PAINT_URL", "https://bad-endpoint.invalid")
	t.Setenv("PAINT_BROWSER", "/nonexistent/artist-skill-browser")
	paths := []string{"SKILL.md", "references/season-one-example.md", "references/cli-craft.md"}
	var bundle string
	for _, args := range [][]string{{"--artist-skill"}, {"guide", "--artist-skill"}, {"guide", "-artist-skill"}} {
		code, out, stderr := runArtistOffline(t, args...)
		if code != 0 || stderr != "" {
			t.Fatalf("%v: exit=%d stderr=%s", args, code, stderr)
		}
		if bundle == "" {
			bundle = out
		} else if out != bundle {
			t.Fatalf("%v differs from top-level alias", args)
		}
	}
	remaining := bundle
	for _, path := range paths {
		source, err := os.ReadFile(filepath.Join("../../../../docs/artist-skill", path))
		if err != nil {
			t.Fatal(err)
		}
		label := "## " + path + "\n\n"
		_, after, found := strings.Cut(remaining, label)
		if !found || !strings.HasPrefix(after, string(source)) {
			t.Fatalf("missing labelled complete source for %s", path)
		}
		if strings.Count(bundle, string(source)) != 1 {
			t.Fatalf("source must appear exactly once: %s", path)
		}
		remaining = after[len(source):]
	}
	if !strings.Contains(bundle, "Relative reference paths identify the included sections below.") {
		t.Fatal("missing explanation of bundled relative paths")
	}
	for _, args := range [][]string{{"--artist-skill", "--json"}, {"guide", "--artist-skill", "--json"}, {"guide", "--json", "--artist-skill"}} {
		code, out, stderr := runArtistOffline(t, args...)
		var envelope map[string]string
		if code != 0 || stderr != "" || json.Unmarshal([]byte(out), &envelope) != nil || len(envelope) != 1 || envelope["text"]+"\n" != bundle {
			t.Fatalf("%v: JSON envelope differs from complete bundle: exit=%d stderr=%s", args, code, stderr)
		}
	}
	guide, err := os.ReadFile("../../../../docs/agent-guide.md")
	if err != nil {
		t.Fatal(err)
	}
	code, out, stderr := runArtistOffline(t, "guide")
	if code != 0 || stderr != "" || out != string(guide)+"\n" {
		t.Fatal("plain guide differs from complete original source")
	}
}

func TestArtistSkillInvalidInvocationsBeforeIO(t *testing.T) {
	cases := [][]string{
		{"--artist-skill=true"}, {"--artist-skill=false"}, {"--artist-skill="},
		{"--artist-skill", "true"}, {"--artist-skill", "guide"}, {"--artist-skill", "--", "extra"},
		{"--artist-skill", "--artist-skill"}, {"--artist-skill", "-artist-skill"},
		{"guide", "--artist-skill=true"}, {"guide", "-artist-skill=false"}, {"guide", "--artist-skill="},
		{"guide", "--artist-skill", "false"}, {"guide", "extra", "--artist-skill"},
		{"guide", "--artist-skill", "--artist-skill"}, {"guide", "--artist-skill", "-artist-skill"},
		{"guide", "--artist-skill", "--browser", "missing"},
		{"--artist-skill", "extra", "--help"}, {"guide", "--artist-skill", "extra", "--help"},
	}
	for _, command := range commandNames() {
		if command != "guide" {
			cases = append(cases, []string{command, "--artist-skill"}, []string{command, "--artist-skill", "--help"})
		}
	}
	for _, args := range cases {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			code, out, stderr := runArtistOffline(t, args...)
			if code != 2 || out != "" || !strings.HasPrefix(stderr, "paint: ") {
				t.Fatalf("exit=%d stdout=%s stderr=%s", code, out, stderr)
			}
			jsonArgs := append([]string{args[0], "--json"}, args[1:]...)
			code, out, stderr = runArtistOffline(t, jsonArgs...)
			var detail map[string]string
			if code != 2 || out != "" || json.Unmarshal([]byte(stderr), &detail) != nil || detail["error"] != "USAGE" {
				t.Fatalf("JSON error: exit=%d stdout=%s stderr=%s", code, out, stderr)
			}
		})
	}
}

func TestArtistSkillDiscoverability(t *testing.T) {
	for _, args := range [][]string{{"help"}, {"help", "guide"}, {"guide", "--help"}, {"--artist-skill", "--help"}} {
		code, out, stderr := runArtistOffline(t, args...)
		if code != 0 || stderr != "" || !strings.Contains(out, "--artist-skill") {
			t.Fatalf("%v: artist-skill missing from help", args)
		}
	}
	for _, shell := range []string{"bash", "zsh", "fish"} {
		script, err := completion(shell)
		if err != nil || !strings.Contains(script, "artist-skill") {
			t.Fatalf("%s completion missing artist-skill: %v", shell, err)
		}
		if shell == "fish" {
			for _, condition := range []string{"__fish_use_subcommand", "__fish_seen_subcommand_from guide"} {
				if !strings.Contains(script, "complete -c paint -n '"+condition+"' -l artist-skill\n") {
					t.Fatalf("fish must offer boolean artist-skill without a value: %s", condition)
				}
			}
		}
	}
}
