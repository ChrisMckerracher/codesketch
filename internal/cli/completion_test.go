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
