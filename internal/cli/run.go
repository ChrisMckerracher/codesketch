// Package cli orchestrates the native paint command and its owned contexts.
package cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/ChrisMckerracher/codesketch/internal/cli/capture"
	"github.com/ChrisMckerracher/codesketch/internal/cli/parse"
	"github.com/ChrisMckerracher/codesketch/internal/cli/transport"
)

// Version can be set with -ldflags -X at build time.
var Version = "1.0.0"

type Runner struct {
	In       io.ReadCloser
	Out, Err io.Writer
	Env      func(string) string
	Capture  func(context.Context, json.RawMessage, capture.Options) (capture.Result, error)
}

type failure struct {
	code, message string
	usage         bool
}

func (e *failure) Error() string { return e.message }
func usage(format string, args ...any) error {
	return &failure{"USAGE", fmt.Sprintf(format, args...), true}
}

func (r Runner) Run(ctx context.Context, argv []string) int {
	if r.In == nil {
		r.In = os.Stdin
	}
	if r.Out == nil {
		r.Out = os.Stdout
	}
	if r.Err == nil {
		r.Err = os.Stderr
	}
	if r.Env == nil {
		r.Env = os.Getenv
	}
	if r.Capture == nil {
		r.Capture = capture.Run
	}
	err := r.dispatch(ctx, argv)
	if err == nil {
		return 0
	}
	code, exit := "ERROR", 1
	var f *failure
	var remote *transport.Error
	if errors.As(err, &f) {
		code = f.code
		if f.usage {
			exit = 2
		}
	}
	if errors.As(err, &remote) {
		code = remote.Code
	}
	if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
		code, exit = "INTERRUPTED", 130
	}
	if jsonRequested(argv) {
		_ = json.NewEncoder(r.Err).Encode(map[string]string{"error": code, "message": err.Error()})
	} else {
		fmt.Fprintf(r.Err, "paint: %s\n", err)
	}
	return exit
}

func jsonRequested(args []string) bool {
	for _, arg := range args {
		if arg == "--" {
			break
		}
		if arg == "--json" || arg == "-json" || strings.HasPrefix(arg, "--json=") || strings.HasPrefix(arg, "-json=") {
			return true
		}
	}
	return false
}

var commandFlags = map[string]string{
	"status": "", "stroke": "points brush color size opacity layer paused replace",
	"rect":    "x y width height color opacity layer paused replace",
	"ellipse": "x y width height color opacity layer paused replace",
	"fill":    "color paused replace", "layer": "name opacity visible paused replace",
	"submit": "paused replace", "view": "crop scale browser", "export": "crop scale browser",
	"wait": "timeout", "watch": "timeout interval", "pause": "", "resume": "", "step": "",
	"clear": "", "undo": "", "redo": "", "new": "", "speed": "speed", "feedback": "",
	"save": "", "load": "", "doctor": "browser", "help": "", "guide": "artist-skill", "version": "", "completion": "",
}

func (r Runner) dispatch(ctx context.Context, argv []string) error {
	if len(argv) == 0 {
		return r.text(helpText())
	}
	command := argv[0]
	args := argv[1:]
	if command == "--artist-skill" || strings.HasPrefix(command, "--artist-skill=") {
		command, args = "guide", argv
	}
	if command == "--version" {
		command = "version"
	}
	if command == "--help" || command == "-h" {
		command = "help"
	}
	flags, ok := commandFlags[command]
	if !ok {
		return usage("unknown command %q; run paint help", command)
	}
	a, err := parse.Args(args, strings.Fields(flags+" json help h"))
	if err != nil {
		return usage("%s", err)
	}
	if a.Booleans["help"] && a.Booleans["h"] {
		return usage("help provided twice")
	}
	if a.Booleans["artist-skill"] {
		if err := count(a, 0, 0, "guide --artist-skill"); err != nil {
			return err
		}
	}
	if a.Booleans["help"] || a.Booleans["h"] {
		return r.offlineText(a, commandHelp(command))
	}
	if handled, err := r.offline(command, a); handled {
		return err
	}
	job, err := prepare(command, a)
	if err != nil {
		return err
	}
	if command == "doctor" {
		return r.doctor(ctx, a)
	}
	c, err := transport.New(r.Env("PAINT_URL"))
	if err != nil {
		return usage("%s", err)
	}
	defer c.Close()
	return r.execute(ctx, c, command, a, job)
}

func (r Runner) text(s string) error { _, err := fmt.Fprintln(r.Out, s); return err }
func (r Runner) output(v any) error {
	e := json.NewEncoder(r.Out)
	e.SetIndent("", "  ")
	return e.Encode(v)
}

func count(a *parse.Result, minCount, maxCount int, syntax string) error {
	if len(a.Positionals) < minCount || len(a.Positionals) > maxCount {
		return usage("usage: paint %s", syntax)
	}
	for _, p := range a.Positionals {
		if p == "" {
			return usage("arguments must be non-empty")
		}
	}
	return nil
}

func value(a *parse.Result, name, fallback string) string {
	if v, ok := a.Flags[name]; ok {
		return v
	}
	return fallback
}

func number(a *parse.Result, name, fallback string, low, high float64) (float64, error) {
	n, err := parse.FiniteNumber(value(a, name, fallback), name, low, high)
	if err != nil {
		return 0, usage("%s", err)
	}
	return n, nil
}
