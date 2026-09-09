package capture

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// writeExecutable creates an executable fixture file and returns its path.
func writeExecutable(t *testing.T, name string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatalf("write executable fixture: %v", err)
	}
	return path
}

func TestDiscoverBrowserOverrideWinsOverEnvironment(t *testing.T) {
	override := writeExecutable(t, "override-browser")
	envPath := writeExecutable(t, "env-browser")
	t.Setenv(envBrowser, envPath)

	got, err := DiscoverBrowser(override)
	if err != nil {
		t.Fatalf("DiscoverBrowser(%q): %v", override, err)
	}
	if got != override {
		t.Fatalf("DiscoverBrowser(%q) = %q, want override path", override, got)
	}
}

func TestDiscoverBrowserEnvironmentWinsOverScan(t *testing.T) {
	envPath := writeExecutable(t, "env-browser")
	t.Setenv(envBrowser, envPath)
	t.Setenv("PATH", t.TempDir())

	got, err := DiscoverBrowser("")
	if err != nil {
		t.Fatalf("DiscoverBrowser(\"\"): %v", err)
	}
	if got != envPath {
		t.Fatalf("DiscoverBrowser(\"\") = %q, want PAINT_BROWSER path %q", got, envPath)
	}
}

func TestDiscoverBrowserMissingOverrideErrorsEvenWithEnvironment(t *testing.T) {
	envPath := writeExecutable(t, "env-browser")
	t.Setenv(envBrowser, envPath)

	_, err := DiscoverBrowser(filepath.Join(t.TempDir(), "missing"))
	if err == nil {
		t.Fatal("DiscoverBrowser with missing override: want error, got nil")
	}
	if !strings.Contains(err.Error(), "Specified browser executable not found") {
		t.Fatalf("error = %v, want override-not-found message", err)
	}
}

func TestDiscoverBrowserMissingEnvironmentErrorsEvenWithScanCandidates(t *testing.T) {
	t.Setenv(envBrowser, filepath.Join(t.TempDir(), "missing"))
	t.Setenv("PATH", t.TempDir())

	_, err := DiscoverBrowser("")
	if err == nil {
		t.Fatal("DiscoverBrowser with missing PAINT_BROWSER: want error, got nil")
	}
	if !strings.Contains(err.Error(), "PAINT_BROWSER executable not found") {
		t.Fatalf("error = %v, want PAINT_BROWSER-not-found message", err)
	}
}

func TestDiscoverBrowserRejectsUnusableEnvironmentPaths(t *testing.T) {
	directory := t.TempDir()
	t.Setenv(envBrowser, directory)
	if _, err := DiscoverBrowser(""); err == nil {
		t.Fatal("directory PAINT_BROWSER: want error, got nil")
	}

	if runtime.GOOS != "windows" {
		plain := filepath.Join(t.TempDir(), "plain")
		if err := os.WriteFile(plain, []byte("#!/bin/sh\n"), 0o644); err != nil {
			t.Fatalf("write non-executable fixture: %v", err)
		}
		t.Setenv(envBrowser, plain)
		if _, err := DiscoverBrowser(""); err == nil {
			t.Fatal("non-executable PAINT_BROWSER: want error, got nil")
		}
	}
}

func TestDiscoverBrowserReturnsAbsolutePath(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	if err := os.WriteFile("relative-browser", []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatalf("write relative fixture: %v", err)
	}

	got, err := DiscoverBrowser("relative-browser")
	if err != nil {
		t.Fatalf("DiscoverBrowser(\"relative-browser\"): %v", err)
	}
	if want := filepath.Join(dir, "relative-browser"); got != want {
		t.Fatalf("DiscoverBrowser(\"relative-browser\") = %q, want %q", got, want)
	}
	if !filepath.IsAbs(got) {
		t.Fatalf("DiscoverBrowser returned relative path %q", got)
	}
}

func TestScanPathEnvFindsCandidateByName(t *testing.T) {
	dir := t.TempDir()
	name := "chromium"
	if runtime.GOOS == "windows" {
		name = "chromium.exe"
	}
	if err := os.WriteFile(filepath.Join(dir, name), []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatalf("write PATH fixture: %v", err)
	}
	t.Setenv("PATH", dir)

	got, ok := scanPathEnv()
	if !ok {
		t.Fatal("scanPathEnv: want found, got not found")
	}
	if want := filepath.Join(dir, name); got != want {
		t.Fatalf("scanPathEnv() = %q, want %q", got, want)
	}
}

func TestScanPathEnvSkipsNonExecutable(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows executability is not represented by POSIX mode bits")
	}
	dir := t.TempDir()
	name := "google-chrome"
	if runtime.GOOS == "windows" {
		name = "google-chrome.exe"
	}
	if err := os.WriteFile(filepath.Join(dir, name), []byte("#!/bin/sh\n"), 0o644); err != nil {
		t.Fatalf("write PATH fixture: %v", err)
	}
	t.Setenv("PATH", dir)

	if got, ok := scanPathEnv(); ok {
		t.Fatalf("scanPathEnv() = %q, want not found for non-executable candidate", got)
	}
}
