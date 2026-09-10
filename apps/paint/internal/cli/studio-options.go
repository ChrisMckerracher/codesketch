package cli

import (
	"strconv"

	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/lifecycle"
	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/parse"
)

// studioActions is the closed set of managed-lifecycle actions; the omitted
// action means start.
var studioActions = map[string]bool{"start": true, "status": true, "stop": true, "restart": true}

// studioStartupFlags configure how a runtime starts. status and stop act on
// the already-configured runtime and reject them.
var studioStartupFlags = []string{"cache-dir", "node", "port", "no-open"}

// studioOptions validates a parsed paint studio invocation and returns the
// action with lifecycle options. Validation reads only user environment
// defaults: it touches no files, starts no processes, and probes no network.
// The next wire slice forwards the result to the lifecycle Manager.
func studioOptions(a *parse.Result) (string, lifecycle.Options, error) {
	if err := count(a, 0, 1, "studio [start|status|stop|restart]"); err != nil {
		return "", lifecycle.Options{}, err
	}
	action := "start"
	if len(a.Positionals) == 1 {
		action = a.Positionals[0]
		if !studioActions[action] {
			return "", lifecycle.Options{}, usage("unknown studio action %q; use start, status, stop, or restart", action)
		}
	}
	for _, flag := range studioStartupFlags {
		_, hasValue := a.Flags[flag]
		if (hasValue || a.Booleans[flag]) && (action == "status" || action == "stop") {
			return "", lifecycle.Options{}, usage("--%s configures startup only; paint studio %s rejects it", flag, action)
		}
	}
	options, err := lifecycle.DefaultOptions()
	if err != nil {
		return "", lifecycle.Options{}, err
	}
	if raw, ok := a.Flags["data-dir"]; ok {
		if raw == "" {
			return "", lifecycle.Options{}, usage("--data-dir requires a non-empty directory")
		}
		options.DataDir = raw
	}
	if raw, ok := a.Flags["cache-dir"]; ok {
		if raw == "" {
			return "", lifecycle.Options{}, usage("--cache-dir requires a non-empty directory")
		}
		options.CacheDir = raw
	}
	if raw, ok := a.Flags["node"]; ok {
		if raw == "" {
			return "", lifecycle.Options{}, usage("--node requires a non-empty executable path")
		}
		options.Node = raw
	}
	if raw, ok := a.Flags["port"]; ok {
		port, err := strconv.Atoi(raw)
		if err != nil {
			return "", lifecycle.Options{}, usage("--port must be an integer: 0 for ephemeral, or 1024..65535")
		}
		if port != 0 && (port < 1024 || port > 65535) {
			return "", lifecycle.Options{}, usage("--port must be 0 for ephemeral, or 1024..65535, got %d", port)
		}
		options.Port = port
	}
	options.NoOpen = a.Booleans["no-open"]
	return action, options, nil
}
