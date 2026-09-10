package cli

import (
	"fmt"
	"sort"
	"strings"

	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/parse"
	assets "github.com/ChrisMckerracher/codesketch/docs"
)

var descriptions = map[string]string{
	"status":     "status [--json]\nShow instance, revision, playback, history, layers, and current comments of the artwork session. JSON contains the complete state snapshot. For the managed process, see paint studio status.",
	"studio":     "studio [start|status|stop|restart] [--data-dir DIR] [--json]\nManage the embedded studio runtime. Omitting the action starts it: the runtime serves the cached application and stores document data durably, requires Node 22+ on macOS or Linux. start and restart also accept --cache-dir DIR, --node PATH, --port N (0 picks an ephemeral port), and --no-open; status and stop reject startup-only flags. paint status shows the artwork snapshot of a session; paint studio status reports the managed process (URL, instance, pid, state).",
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
	"finish":     "finish\nFinish the active partial stroke and every queued command atomically. Requires --generation STRING and --epoch N; add --grant TOKEN when requiresGrant is true. Playback settles paused with zero remaining.",
	"clear":      "clear\nDiscard pending commands and the active partial stroke; pause playback.",
	"undo":       "undo\nUndo one committed command and clear pending work.",
	"redo":       "redo\nRedo one command and clear pending work.",
	"new":        "new\nReset the document, history, queue, and comments to a fresh session.",
	"speed":      "speed NUMBER\nSet playback speed 0.25..8. --speed NUMBER is also accepted.",
	"comments":   "comments [list|wait|watch|ack|address]\nList human comments or follow them live. list (default) prints anchored comments with the cursor, generation, and epoch needed for follow-up. wait blocks for the next comments change, reset, or control change; timeout 0.001..30 seconds (default 30) exits 1 with COMMENTS_TIMEOUT and never resumes playback. watch streams the initial envelope then change events (compact NDJSON with --json); its deadline exits 0. ack and address ID confirm a comment with --generation STRING and --seq N; stale 409 conflicts surface as errors without auto-refresh.",
	"save":       "save FILE\nSave full project JSON atomically, including history, cursor, queue, and comments.",
	"load":       "load FILE|-\nRestore project JSON from a regular file or stdin, with pending playback paused. Input: 8 MiB, 10 seconds.",
	"doctor":     "doctor [--browser PATH]\nCheck executable/build information, loopback endpoint, studio reachability, and installed Chromium availability. Failed checks exit 1.",
	"help":       "help [COMMAND]\nPrint offline command help. Every command accepts --help or -h.",
	"guide":      "guide [--artist-skill]\nPrint the complete embedded agent integration guide, including renderer mechanics, limits, and the collaborative painting workflow.\n--artist-skill prints the complete offline artist skill and both references. paint --artist-skill is an alias.",
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
	lines = append(lines, "  --artist-skill (alias for guide --artist-skill; complete offline skill and references)")
	return strings.Join(lines, "\n") + "\n\nDrawing: --paused stages work, --replace replaces pending work. All commands accept --json.\nMutations: --generation STRING and --epoch N are required together, even on a fresh session; --grant TOKEN is required for execution when requiresGrant is true and may be omitted for paused staging. Nothing is read or refreshed automatically.\nStudio lifecycle: paint studio start|status|stop|restart manages the embedded runtime (cached runtime and durable data directories, Node 22+, macOS and Linux). Bare paint starts and opens it; --no-open preserves headless use. paint status is the artwork snapshot; paint studio status is the managed process.\nEnvironment: PAINT_URL (default http://127.0.0.1:4317), PAINT_BROWSER (Chromium executable).\nExit status: 0 success, 1 runtime failure, 2 invalid invocation, 130 interruption.\nStart with paint guide. Preserve human pauses until continuation is authorized."
}

func commandHelp(command string) string {
	text := "Usage: paint " + descriptions[command]
	if strings.Contains(commandFlags[command], "paused") {
		text += "\n--paused queues while paused; --replace replaces pending work. Human pauses remain sticky."
	}
	if grantEligibleCommands[command] {
		text += "\n--generation STRING and --epoch N are required together, even on a fresh session; --grant TOKEN is required for execution when requiresGrant is true and may be omitted for paused staging. They forward as explicit agent control context and are never supplied automatically."
	}
	if command == "layer" {
		text += "\nThe context flags apply to layer add and layer update; layer list rejects them."
	}
	if command == "studio" {
		text += "\nDefaults come from the platform config and cache directories with port 4317. Bare paint starts and opens the studio; --no-open preserves headless use."
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
			if a.Booleans["artist-skill"] {
				return true, r.offlineText(a, artistSkillBundle())
			}
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
