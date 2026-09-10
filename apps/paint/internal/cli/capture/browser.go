package capture

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// envBrowser names the environment variable overriding browser discovery.
const envBrowser = "PAINT_BROWSER"

// pathCandidateNames are Chromium-family executable names searched on PATH,
// mirroring the JavaScript CLI discovery order.
var pathCandidateNames = []string{
	"google-chrome",
	"google-chrome-stable",
	"chromium",
	"chromium-browser",
	"chrome",
	"msedge",
}

// DiscoverBrowser resolves a usable Chromium-family executable without
// installing anything. Precedence: explicit override, then PAINT_BROWSER,
// then common installed paths, then PATH. It returns an absolute path.
func DiscoverBrowser(override string) (string, error) {
	if override != "" {
		return configuredBrowser(override, "Specified browser executable not found: %s")
	}
	if envPath := os.Getenv(envBrowser); envPath != "" {
		return configuredBrowser(envPath, "PAINT_BROWSER executable not found: %s")
	}
	for _, candidate := range platformCandidates() {
		if path, ok := usableBrowserPath(candidate); ok {
			return path, nil
		}
	}
	if path, ok := scanPathEnv(); ok {
		return path, nil
	}
	return "", errors.New("No Chromium-family browser found. Install Google Chrome or Chromium, or set the PAINT_BROWSER environment variable to the browser executable path.")
}

// configuredBrowser validates an explicitly configured path and never falls
// back to discovery: a configured browser that is unusable is an error.
func configuredBrowser(path, missingFormat string) (string, error) {
	resolved, ok := usableBrowserPath(path)
	if !ok {
		return "", fmt.Errorf(missingFormat, path)
	}
	return resolved, nil
}

// usableBrowserPath reports whether path names an executable file and returns
// its absolute form.
func usableBrowserPath(path string) (string, bool) {
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() {
		return "", false
	}
	if runtime.GOOS != "windows" && info.Mode()&0o111 == 0 {
		return "", false
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", false
	}
	return absolute, true
}

// platformCandidates lists common installed browser executables for the host
// operating system, mirroring the JavaScript CLI candidate order.
func platformCandidates() []string {
	switch runtime.GOOS {
	case "darwin":
		return darwinCandidates()
	case "linux":
		return []string{
			"/usr/bin/google-chrome",
			"/usr/bin/google-chrome-stable",
			"/usr/bin/chromium",
			"/usr/bin/chromium-browser",
			"/snap/bin/chromium",
		}
	case "windows":
		return windowsCandidates()
	default:
		return nil
	}
}

func darwinCandidates() []string {
	candidates := []string{
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		"/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
		"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
	}
	if home, err := os.UserHomeDir(); err == nil {
		candidates = append(candidates,
			filepath.Join(home, "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
			filepath.Join(home, "Applications", "Chromium.app", "Contents", "MacOS", "Chromium"),
		)
	}
	return candidates
}

func windowsCandidates() []string {
	candidates := []string{
		`C:\Program Files\Google\Chrome\Application\chrome.exe`,
		`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
		`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
	}
	if local := os.Getenv("LOCALAPPDATA"); local != "" {
		candidates = append(candidates,
			filepath.Join(local, "Google", "Chrome", "Application", "chrome.exe"),
		)
	}
	return candidates
}

// scanPathEnv searches PATH for a usable Chromium-family executable.
func scanPathEnv() (string, bool) {
	for _, dir := range filepath.SplitList(os.Getenv("PATH")) {
		if dir == "" {
			continue
		}
		for _, name := range pathCandidateNames {
			if runtime.GOOS == "windows" {
				name += ".exe"
			}
			if path, ok := usableBrowserPath(filepath.Join(dir, name)); ok {
				return path, true
			}
		}
	}
	return "", false
}
