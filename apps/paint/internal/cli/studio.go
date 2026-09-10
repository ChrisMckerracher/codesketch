package cli

import (
	"context"
	"fmt"
	"strings"

	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/lifecycle"
	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/parse"
)

// studioStartFlags are the flags that turn a bare paint invocation into a
// managed studio start instead of a command lookup.
var studioStartFlags = map[string]bool{
	"data-dir": true, "cache-dir": true, "node": true,
	"port": true, "no-open": true, "json": true,
}

// studioStartupFlag reports whether a first argument selects the bare
// managed start path. Offline forms such as --help, -h, --version, and
// --artist-skill stay commands and are not startup flags.
func studioStartupFlag(arg string) bool {
	if arg == "-" || arg == "--" || !strings.HasPrefix(arg, "-") {
		return false
	}
	name, _, _ := strings.Cut(strings.TrimLeft(arg, "-"), "=")
	return studioStartFlags[name]
}

// runLifecycle is the production Lifecycle seam: it constructs a Manager
// from validated options and dispatches the action.
func runLifecycle(ctx context.Context, action string, options lifecycle.Options) (lifecycle.Result, error) {
	manager, err := lifecycle.New(options)
	if err != nil {
		return lifecycle.Result{}, err
	}
	switch action {
	case "start":
		return manager.Start(ctx)
	case "status":
		return manager.Status(ctx)
	case "stop":
		return manager.Stop(ctx)
	case "restart":
		return manager.Restart(ctx)
	default:
		return lifecycle.Result{}, fmt.Errorf("unknown lifecycle action %q", action)
	}
}

// startStudio runs the bare paint start path: managed start or reuse of the
// running studio, then the workspace opens unless --no-open. Any positional
// belongs to the explicit paint studio form and is rejected here.
func (r Runner) startStudio(ctx context.Context, argv []string) error {
	a, err := parse.Args(argv, strings.Fields(commandFlags["studio"]+" json help h"))
	if err != nil {
		return usage("%s", err)
	}
	if a.Booleans["help"] || a.Booleans["h"] {
		return r.offlineText(a, helpText())
	}
	if len(a.Positionals) > 0 {
		return usage("bare paint starts the studio; use paint studio [start|status|stop|restart]")
	}
	_, options, err := studioOptions(a)
	if err != nil {
		return err
	}
	return r.lifecycleCommand(ctx, "start", options, a.Booleans["json"])
}

// lifecycleCommand runs one managed lifecycle action through the seam. A
// browser failure after a healthy start still reports the running studio
// before the error; every other error prints no fake successful result.
func (r Runner) lifecycleCommand(ctx context.Context, action string, options lifecycle.Options, jsonOut bool) error {
	result, err := r.Lifecycle(ctx, action, options)
	if err != nil {
		if result.State == lifecycle.Running && result.URL != "" {
			if renderErr := r.renderLifecycle(result, jsonOut); renderErr != nil {
				return renderErr
			}
		}
		return err
	}
	return r.renderLifecycle(result, jsonOut)
}

func (r Runner) renderLifecycle(result lifecycle.Result, jsonOut bool) error {
	if jsonOut {
		return r.output(result)
	}
	return r.text(lifecycleSummary(result))
}

func lifecycleSummary(result lifecycle.Result) string {
	switch result.State {
	case lifecycle.Running:
		return fmt.Sprintf("Studio running at %s (pid %d)", result.URL, result.PID)
	case lifecycle.Stopping:
		return fmt.Sprintf("Studio stopping (pid %d)", result.PID)
	default:
		return "Studio stopped"
	}
}
