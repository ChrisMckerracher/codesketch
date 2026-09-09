package cli

import (
	"fmt"
	"sort"
	"strings"

	assets "github.com/ChrisMckerracher/codesketch"
	"github.com/ChrisMckerracher/codesketch/internal/cli/parse"
)

var descriptions = map[string]string{
	"status":     "status [--json]\nShow instance, revision, playback, history, layers, and latest feedback. JSON contains the complete state snapshot.",
	"stroke":     "stroke --points 'x,y x,y...' [--brush B] [--color C] [--size N] [--opacity N] [--layer ID]\nBrush: brush, pencil, marker, eraser. Defaults: brush, #253d38, size 8, opacity 1, layer paint. Size 1..100; 1..2000 points.",
	"rect":       "rect --x X --y Y --width W --height H [--color C] [--opacity N] [--layer ID]\nQueue a filled rectangle within the 1000x700 canvas. Defaults: #253d38, opacity 1, layer paint.",
	"ellipse":    "ellipse --x X --y Y --width W --height H [--color C] [--opacity N] [--layer ID]\nQueue a filled ellipse within the 1000x700 canvas. Defaults: #253d38, opacity 1, layer paint.",
	"fill":       "fill COLOR\nSet the document background. COLOR is #rrggbb; --color COLOR is also accepted.",
	"layer":      "layer list | layer add ID NAME | layer update ID [--name NAME] [--opacity N] [--visible true|false]\nLayers stack back-to-front. IDs start with a letter, up to 40 letters/digits/underscores/hyphens. Names: 1..80 characters. Opacity: 0..1.",
	"submit":     "submit FILE|-\nQueue a JSON array or {\"commands\":[...]} from a regular file or stdin. Input: 8 MiB, 10 seconds; 1..3000 commands. Batches validate atomically.",
	"view":       "view [FILE] [--crop x,y,w,h] [--scale N] [--browser PATH]\nCapture one immutable PNG, including the active partial stroke. Omitted FILE uses a temporary file. Scale: 0.1..10, default 1. Open the returned path with your image reader.",
	"export":     "export FILE [--crop x,y,w,h] [--scale N] [--browser PATH]\nExport one immutable PNG containing committed artwork. Scale: 0.1..10, default 1. FILE is required.",
	"wait":       "wait [--timeout SECONDS]\nReturn promptly when playback is idle or paused. Default: 30 seconds; range 0.001..3600. On deadline, exits 1 with WAIT_TIMEOUT.",
	"watch":      "watch [--timeout SECONDS] [--interval MILLISECONDS]\nStream initial state and changes. --json emits compact NDJSON. Timeout: 0.001..3600 seconds (default 30); interval: 50..10000 ms (default 400). Normal deadline exits 0.",
	"pause":      "pause\nPause playback and preserve queued commands.",
	"resume":     "resume\nResume pending playback. Resume a human pause only when continuation is authorized.",
	"step":       "step\nCommit one pending command and remain paused.",
	"clear":      "clear\nDiscard pending commands and the active partial stroke; pause playback.",
	"undo":       "undo\nUndo one committed command and clear pending work.",
	"redo":       "redo\nRedo one command and clear pending work.",
	"new":        "new\nReset the document, history, queue, and feedback to a fresh session.",
	"speed":      "speed NUMBER\nSet playback speed 0.25..8. --speed NUMBER is also accepted.",
	"feedback":   "feedback [TEXT...]\nList notes, or record a note and pause playback. Notes contain 1..2000 characters. Use -- before text beginning with a dash.",
	"save":       "save FILE\nSave full project JSON atomically, including history, cursor, queue, and feedback.",
	"load":       "load FILE|-\nRestore project JSON from a regular file or stdin, with pending playback paused. Input: 8 MiB, 10 seconds.",
	"doctor":     "doctor [--browser PATH]\nCheck executable/build information, loopback endpoint, studio reachability, and installed Chromium availability. Failed checks exit 1.",
	"help":       "help [COMMAND]\nPrint offline command help. Every command accepts --help or -h.",
	"guide":      "guide\nPrint the complete embedded agent integration guide, including renderer mechanics, limits, and the collaborative painting workflow.",
	"version":    "version\nPrint the executable version. --version is an alias. Doctor reports build details.",
	"completion": "completion bash|zsh|fish\nPrint shell completion definitions for paint. Source the output using your shell's completion setup.",
}

func commandNames() []string {
	names := make([]string, 0, len(commandFlags))
	for k := range commandFlags {
		names = append(names, k)
	}
	sort.Strings(names)
	return names
}

func helpText() string {
	lines := []string{"paint - Codesketch native painting CLI", "", "Usage: paint COMMAND [arguments] [flags]", ""}
	for _, command := range commandNames() {
		syntax, _, _ := strings.Cut(descriptions[command], "\n")
		lines = append(lines, "  "+syntax)
	}
	return strings.Join(lines, "\n") + "\n\nDrawing: --paused stages work, --replace replaces pending work. All commands accept --json.\nEnvironment: PAINT_URL (default http://127.0.0.1:4317), PAINT_BROWSER (Chromium executable).\nExit status: 0 success, 1 runtime failure, 2 invalid invocation, 130 interruption.\nStart with paint guide. Preserve human pauses until continuation is authorized."
}

func commandHelp(command string) string {
	text := "Usage: paint " + descriptions[command]
	if strings.Contains(commandFlags[command], "paused") {
		text += "\n--paused queues while paused; --replace replaces pending work. Human pauses remain sticky."
	}
	return text + "\n--json prints structured output; errors go to stderr. --help prints this help."
}

func (r Runner) offline(command string, a *parse.Result) (bool, error) {
	switch command {
	case "help":
		if err := count(a, 0, 1, "help [COMMAND]"); err != nil {
			return true, err
		}
		text := helpText()
		if len(a.Positionals) == 1 {
			target := a.Positionals[0]
			if _, ok := commandFlags[target]; !ok {
				return true, usage("unknown command %q", target)
			}
			text = commandHelp(target)
		}
		return true, r.offlineText(a, text)
	case "guide", "version":
		if err := count(a, 0, 0, command); err != nil {
			return true, err
		}
		if command == "guide" {
			return true, r.offlineText(a, assets.AgentGuide)
		}
		if a.Booleans["json"] {
			return true, r.output(map[string]string{"version": Version})
		}
		return true, r.text(fmt.Sprintf("paint %s", Version))
	case "completion":
		if err := count(a, 1, 1, "completion bash|zsh|fish"); err != nil {
			return true, err
		}
		text, err := completion(a.Positionals[0])
		if err != nil {
			return true, err
		}
		return true, r.offlineText(a, text)
	}
	return false, nil
}

func (r Runner) offlineText(a *parse.Result, text string) error {
	if a.Booleans["json"] {
		return r.output(map[string]string{"text": text})
	}
	return r.text(text)
}
