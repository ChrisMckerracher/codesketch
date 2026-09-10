package cli

import (
	"fmt"
	"os/exec"
	"strings"
	"testing"
)

func TestCompletionSyntax(t *testing.T) {
	for _, shell := range []string{"bash", "zsh", "fish"} {
		t.Run(shell, func(t *testing.T) {
			path, err := exec.LookPath(shell)
			if err != nil {
				t.Skip(shell + " is not installed")
			}
			script, err := completion(shell)
			if err != nil {
				t.Fatal(err)
			}
			cmd := exec.Command(path, "-n")
			cmd.Stdin = strings.NewReader(script)
			if out, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("%s syntax: %v %s", shell, err, out)
			}
		})
	}
}

func TestBashCompletionOffersCommandsAndBrushes(t *testing.T) {
	path, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash is not installed")
	}
	script, err := completion("bash")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		words string
		index int
		want  string
	}{
		{"paint str", 1, "stroke"}, {"paint stroke --brush pen", 3, "pencil"},
		{"paint --art", 1, "--artist-skill"}, {"paint guide --art", 2, "--artist-skill"},
		{"paint --artist-skill --j", 2, "--json"},
		{"paint comm", 1, "comments"}, {"paint comments l", 2, "list"},
		{"paint comments --gen", 2, "--generation"},
	} {
		suffix := fmt.Sprintf("\nCOMP_WORDS=(%s)\nCOMP_CWORD=%d\n_paint_complete\nprintf '%%s\\n' \"${COMPREPLY[@]}\"\n", tc.words, tc.index)
		cmd := exec.Command(path, "--noprofile", "--norc")
		cmd.Stdin = strings.NewReader(script + suffix)
		out, err := cmd.CombinedOutput()
		if err != nil || strings.TrimSpace(string(out)) != tc.want {
			t.Fatalf("%s completion: %v %s", tc.words, err, out)
		}
	}
}

func TestBashCompletionUsesPortableFilenameLoop(t *testing.T) {
	script, err := completion("bash")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(script, "mapfile") || strings.Contains(script, "compopt") {
		t.Fatal("bash completion still emits version-specific constructs needing a rewrite")
	}
	if !strings.Contains(script, "while IFS= read -r candidate") {
		t.Fatal("bash completion lost the portable filename read loop")
	}
}

func TestCompletionOffersStudioLifecycle(t *testing.T) {
	for _, shell := range []string{"bash", "zsh"} {
		script, err := completion(shell)
		if err != nil {
			t.Fatal(err)
		}
		for _, want := range []string{"studio", "--no-open", "start", "status", "stop", "restart"} {
			if !strings.Contains(script, want) {
				t.Errorf("%s completion misses %q", shell, want)
			}
		}
	}
	fish, err := completion("fish")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"studio", "start status stop restart", "-l no-open"} {
		if !strings.Contains(fish, want) {
			t.Errorf("fish completion misses %q", want)
		}
	}
	if strings.Contains(fish, "-l no-open -r") {
		t.Error("fish must complete --no-open as a boolean without a required value")
	}
}

func TestBashCompletionOffersStudioActions(t *testing.T) {
	path, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash is not installed")
	}
	script, err := completion("bash")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		words string
		index int
		want  string
	}{
		{"paint stu", 1, "studio"},
		{"paint studio sto", 2, "stop"},
		{"paint studio re", 2, "restart"},
		{"paint studio --no-", 2, "--no-open"},
		{"paint studio status --data", 3, "--data-dir"},
		{"paint studio status --cac", 3, "--cache-dir"},
	} {
		suffix := fmt.Sprintf("\nCOMP_WORDS=(%s)\nCOMP_CWORD=%d\n_paint_complete\nprintf '%%s\\n' \"${COMPREPLY[@]}\"\n", tc.words, tc.index)
		cmd := exec.Command(path, "--noprofile", "--norc")
		cmd.Stdin = strings.NewReader(script + suffix)
		out, err := cmd.CombinedOutput()
		if err != nil || strings.TrimSpace(string(out)) != tc.want {
			t.Fatalf("%s completion: %v %s", tc.words, err, out)
		}
	}
}

func TestCompletionOmitsRemovedCommands(t *testing.T) {
	for _, shell := range []string{"bash", "zsh", "fish"} {
		script, err := completion(shell)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(script, "feedback") {
			t.Errorf("%s completion still offers the removed feedback command", shell)
		}
	}
}
