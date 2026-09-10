package cli

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"runtime/debug"
	"strings"

	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/capture"
	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/parse"
	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/transport"
)

type check struct {
	OK     bool   `json:"ok"`
	Detail string `json:"detail"`
}

func (r Runner) doctor(ctx context.Context, a *parse.Result) error {
	checks := map[string]check{}
	executable, err := os.Executable()
	checks["executable"] = check{err == nil, executable}
	build := map[string]string{"version": Version, "go": runtime.Version(), "os": runtime.GOOS, "arch": runtime.GOARCH}
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, setting := range info.Settings {
			if strings.HasPrefix(setting.Key, "vcs.") {
				build[setting.Key] = setting.Value
			}
		}
	}
	c, err := transport.New(r.Env("PAINT_URL"))
	if err != nil {
		checks["endpoint"] = check{false, err.Error()}
		checks["studio"] = check{false, "Configure a valid loopback PAINT_URL"}
	} else {
		defer c.Close()
		checks["endpoint"] = check{true, c.URL()}
		data, readErr := c.Request(ctx, "GET", "/api/state", nil)
		if readErr == nil {
			_, readErr = decodeSnapshot(data)
		}
		if readErr != nil {
			checks["studio"] = check{false, readErr.Error()}
		} else {
			checks["studio"] = check{true, "Studio is reachable"}
		}
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	override := value(a, "browser", r.Env("PAINT_BROWSER"))
	browser, err := capture.DiscoverBrowser(override)
	if err != nil {
		checks["browser"] = check{false, err.Error()}
	} else {
		checks["browser"] = check{true, browser}
	}
	ok := true
	for _, c := range checks {
		ok = ok && c.OK
	}
	if a.Booleans["json"] {
		if err := r.output(map[string]any{"ok": ok, "build": build, "checks": checks}); err != nil {
			return err
		}
	} else {
		if err := r.text(fmt.Sprintf("paint %s (%s/%s, %s)", Version, runtime.GOOS, runtime.GOARCH, runtime.Version())); err != nil {
			return err
		}
		for _, name := range []string{"executable", "endpoint", "studio", "browser"} {
			state := "ok"
			if !checks[name].OK {
				state = "failed"
			}
			if err := r.text(fmt.Sprintf("%s: %s - %s", name, state, checks[name].Detail)); err != nil {
				return err
			}
		}
	}
	if !ok {
		return &failure{code: "DOCTOR_FAILED", message: "one or more doctor checks failed"}
	}
	return nil
}
