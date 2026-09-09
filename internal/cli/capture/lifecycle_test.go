//go:build darwin || linux

package capture

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

// The test executable itself acts as a deterministic browser fixture. It
// exercises process groups and HTTP races without any external interpreter.
func init() {
	mode := os.Getenv("PAINT_CAPTURE_HELPER")
	if mode == "" {
		return
	}
	if mode == "child" {
		signal.Ignore(syscall.SIGTERM)
		for {
			time.Sleep(time.Hour)
		}
	}
	dir := os.Getenv("PAINT_CAPTURE_RECORD")
	profile := ""
	for _, arg := range os.Args {
		if strings.HasPrefix(arg, "--user-data-dir=") {
			profile = strings.TrimPrefix(arg, "--user-data-dir=")
		}
	}
	os.WriteFile(filepath.Join(dir, "profile"), []byte(profile), 0600)
	os.WriteFile(filepath.Join(dir, "parent"), []byte(strconv.Itoa(os.Getpid())), 0600)
	if mode == "exit" {
		os.Exit(7)
	}
	executable, _ := os.Executable()
	child := exec.Command(executable)
	child.Env = append(os.Environ(), "PAINT_CAPTURE_HELPER=child")
	if err := child.Start(); err != nil {
		os.Exit(8)
	}
	os.WriteFile(filepath.Join(dir, "child"), []byte(strconv.Itoa(child.Process.Pid)), 0600)
	if mode == "hang" {
		signal.Ignore(syscall.SIGTERM)
		for {
			time.Sleep(time.Hour)
		}
	}
	url := os.Args[len(os.Args)-1]
	base := strings.TrimSuffix(url, "capture.html")
	client := &http.Client{Transport: &http.Transport{Proxy: nil}, Timeout: 5 * time.Second}
	response, err := client.Get(base + "snapshot.json")
	if err != nil {
		os.Exit(9)
	}
	var data captureData
	err = json.NewDecoder(response.Body).Decode(&data)
	response.Body.Close()
	if err != nil {
		os.Exit(10)
	}
	body := helperPNG(data.Width, data.Height)
	if mode == "invalid" {
		body = []byte("malformed PNG")
	}
	request, _ := http.NewRequest("POST", base+"result", bytes.NewReader(body))
	// Origin contains only scheme and authority; the capability remains in URL.
	request.Header.Set("Origin", "http://"+request.URL.Host)
	request.Header.Set("Content-Type", "image/png")
	response, err = client.Do(request)
	if err != nil {
		os.Exit(11)
	}
	response.Body.Close()
	os.Exit(0)
}

func helperEnvironment(t *testing.T, mode string) (string, string) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("PAINT_CAPTURE_HELPER", mode)
	t.Setenv("PAINT_CAPTURE_RECORD", dir)
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	return executable, dir
}

func checkCleanup(t *testing.T, dir string) {
	t.Helper()
	profile, err := os.ReadFile(filepath.Join(dir, "profile"))
	if err != nil {
		t.Fatal("helper did not record profile", err)
	}
	if _, err := os.Stat(string(profile)); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("profile survived", string(profile), err)
	}
	for _, name := range []string{"parent", "child"} {
		raw, err := os.ReadFile(filepath.Join(dir, name))
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		pid, err := strconv.Atoi(string(raw))
		if err != nil {
			t.Fatal(err)
		}
		if err := syscall.Kill(pid, 0); !errors.Is(err, syscall.ESRCH) {
			t.Errorf("%s PID %d survived: %v", name, pid, err)
		}
	}
}

func TestRunOwnedLifecycle(t *testing.T) {
	for _, mode := range []string{"success", "exit", "invalid", "hang"} {
		t.Run(mode, func(t *testing.T) {
			executable, dir := helperEnvironment(t, mode)
			output := filepath.Join(t.TempDir(), "existing.png")
			if err := os.WriteFile(output, []byte("original"), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			got, err := Run(ctx, json.RawMessage(testSnapshot), Options{Browser: executable, Output: output})
			if mode == "success" {
				if err != nil || got.Width != 100 {
					t.Fatal(got, err)
				}
			} else {
				if err == nil {
					t.Fatal("expected capture failure")
				}
				if mode == "hang" && !errors.Is(err, context.DeadlineExceeded) {
					t.Fatal(err)
				}
				body, readErr := os.ReadFile(output)
				if readErr != nil || string(body) != "original" {
					t.Fatal("failed capture changed output", readErr)
				}
			}
			checkCleanup(t, dir)
		})
	}
}

func TestRunCancellation(t *testing.T) {
	executable, dir := helperEnvironment(t, "hang")
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { _, err := Run(ctx, json.RawMessage(testSnapshot), Options{Browser: executable}); done <- err }()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(filepath.Join(dir, "child")); err == nil {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	case <-time.After(4 * time.Second):
		t.Fatal("cancellation did not finish")
	}
	checkCleanup(t, dir)
}

func TestRunPreflightAndStartupFailure(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := Run(ctx, json.RawMessage(testSnapshot), Options{}); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	if _, err := Run(context.Background(), json.RawMessage(`{}`), Options{}); err == nil {
		t.Fatal("invalid snapshot accepted")
	}
	if _, err := Run(context.Background(), json.RawMessage(testSnapshot), Options{Browser: "/missing/capture-browser"}); err == nil {
		t.Fatal("missing browser accepted")
	}
	bad := filepath.Join(t.TempDir(), "invalid-executable")
	if err := os.WriteFile(bad, []byte("invalid executable format"), 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := Run(context.Background(), json.RawMessage(testSnapshot), Options{Browser: bad}); err == nil {
		t.Fatal("startup failure accepted")
	}
}
