package cli

import (
	"strings"
	"testing"

	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/lifecycle"
	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/parse"
)

// parseStudio runs argv through the exact flags dispatch allows for studio.
func parseStudio(t *testing.T, argv ...string) (*parse.Result, error) {
	t.Helper()
	return parse.Args(argv, strings.Fields(commandFlags["studio"]+" json help h"))
}

func TestStudioOptionsDefaultsToStart(t *testing.T) {
	a, err := parseStudio(t)
	if err != nil {
		t.Fatal(err)
	}
	action, options, err := studioOptions(a)
	if err != nil {
		t.Fatal(err)
	}
	if action != "start" {
		t.Fatalf("omitted action = %q, want start", action)
	}
	baseline, err := lifecycle.DefaultOptions()
	if err != nil {
		t.Fatal(err)
	}
	if options != baseline {
		t.Fatalf("options = %+v, want defaults %+v", options, baseline)
	}
	if options.Port != 4317 {
		t.Errorf("default port = %d, want 4317", options.Port)
	}
	if options.NoOpen {
		t.Error("no-open must default to false")
	}
}

func TestStudioOptionsAcceptsEachActionOnce(t *testing.T) {
	for _, action := range []string{"start", "status", "stop", "restart"} {
		a, err := parseStudio(t, action)
		if err != nil {
			t.Fatal(err)
		}
		got, _, err := studioOptions(a)
		if err != nil || got != action {
			t.Fatalf("studioOptions(%q) = %q, %v", action, got, err)
		}
	}
}

func TestStudioOptionsRejectsBadActions(t *testing.T) {
	for _, argv := range [][]string{{"deploy"}, {""}, {"start", "stop"}, {"--", "start", "extra"}} {
		a, err := parseStudio(t, argv...)
		if err != nil {
			continue
		}
		if _, _, err := studioOptions(a); err == nil {
			t.Fatalf("studioOptions(%v) accepted an invalid action", argv)
		}
	}
	a, _ := parseStudio(t, "deploy")
	_, _, err := studioOptions(a)
	if err == nil || !strings.Contains(err.Error(), "unknown studio action") {
		t.Fatalf("unknown action error = %v", err)
	}
}

func TestStudioOptionsPort(t *testing.T) {
	for _, tc := range []struct {
		raw  string
		want int
	}{
		{"0", 0}, {"1024", 1024}, {"4317", 4317}, {"65535", 65535},
	} {
		a, err := parseStudio(t, "start", "--port", tc.raw)
		if err != nil {
			t.Fatal(err)
		}
		_, options, err := studioOptions(a)
		if err != nil {
			t.Fatal(err)
		}
		if options.Port != tc.want {
			t.Errorf("--port %s = %d, want %d", tc.raw, options.Port, tc.want)
		}
	}
	for _, raw := range []string{"", "1023", "65536", "abc", "-1", "4317.5", " 5000x"} {
		a, err := parseStudio(t, "start", "--port", raw)
		if err != nil {
			continue
		}
		if _, _, err := studioOptions(a); err == nil {
			t.Errorf("--port %q must be rejected", raw)
		}
	}
}

func TestStudioOptionsRejectsEmptyValueFlags(t *testing.T) {
	for _, argv := range [][]string{
		{"--data-dir="}, {"--cache-dir="}, {"--node="},
	} {
		a, err := parseStudio(t, argv...)
		if err != nil {
			t.Fatalf("%v: %v", argv, err)
		}
		if _, _, err := studioOptions(a); err == nil {
			t.Errorf("%v must be rejected", argv)
		}
	}
}

func TestStudioOptionsStartupOverrides(t *testing.T) {
	a, err := parseStudio(t, "--data-dir", "/tmp/data", "--cache-dir", "/tmp/cache",
		"--node", "/usr/local/bin/node", "--port=0", "--no-open")
	if err != nil {
		t.Fatal(err)
	}
	action, options, err := studioOptions(a)
	if err != nil {
		t.Fatal(err)
	}
	if action != "start" {
		t.Fatalf("action = %q", action)
	}
	if options.DataDir != "/tmp/data" || options.CacheDir != "/tmp/cache" || options.Node != "/usr/local/bin/node" {
		t.Errorf("directories not applied: %+v", options)
	}
	if options.Port != 0 || !options.NoOpen {
		t.Errorf("port/no-open not applied: %+v", options)
	}
}

func TestStudioOptionsStatusAndStopRejectStartupFlags(t *testing.T) {
	for _, action := range []string{"status", "stop"} {
		for _, argv := range [][]string{
			{"--cache-dir", "/tmp/cache"}, {"--node", "node"}, {"--port", "5000"}, {"--port=0"}, {"--no-open"},
		} {
			a, err := parseStudio(t, append([]string{action}, argv...)...)
			if err != nil {
				t.Fatalf("%s %v: %v", action, argv, err)
			}
			_, _, err = studioOptions(a)
			if err == nil || !strings.Contains(err.Error(), "startup only") {
				t.Errorf("paint studio %s %v: err = %v, want a startup-only rejection", action, argv, err)
			}
		}
	}
}

func TestStudioOptionsDataDirAllowedForEveryAction(t *testing.T) {
	for _, action := range []string{"", "start", "status", "stop", "restart"} {
		argv := []string{"--data-dir", "/tmp/data"}
		if action != "" {
			argv = append([]string{action}, argv...)
		}
		a, err := parseStudio(t, argv...)
		if err != nil {
			t.Fatal(err)
		}
		_, options, err := studioOptions(a)
		if err != nil {
			t.Fatalf("%v: %v", argv, err)
		}
		if options.DataDir != "/tmp/data" {
			t.Errorf("%v: data dir = %q", argv, options.DataDir)
		}
	}
}
