package lifecycle

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

// The launcher helper runs the real Manager.Start inside a plain
// os.Executable subprocess selected with -test.run, so regression evidence
// needs no Go compiler at runtime. The helper owns no accepted-runtime
// cleanup: its normal exit is the stimulus under test, and the parent owns
// authenticated cleanup for anything the launch published or accepted.
const (
	helperRoleEnv      = "CODESKETCH_LIFECYCLE_TEST_HELPER_ROLE"
	helperRoleLauncher = "launcher"
	helperDataEnv      = "CODESKETCH_LIFECYCLE_TEST_DATA"
	helperCacheEnv     = "CODESKETCH_LIFECYCLE_TEST_CACHE"
	helperResultEnv    = "CODESKETCH_LIFECYCLE_TEST_RESULT"
	helperTestRun      = "^TestLifecycleProcessHelper$"
)

// launcherFrame is the bounded public result frame the helper publishes in
// its private result file. It carries no capability material.
type launcherFrame struct {
	OK          bool    `json:"ok"`
	Error       string  `json:"error,omitempty"`
	ElapsedMs   int64   `json:"elapsedMs,omitempty"`
	LauncherSID int     `json:"launcherSid,omitempty"`
	Result      *Result `json:"result,omitempty"`
}

// TestLifecycleProcessHelper is the single helper entrypoint. It returns
// immediately in a normal package run and only acts under an explicit role.
func TestLifecycleProcessHelper(t *testing.T) {
	if os.Getenv(helperRoleEnv) == helperRoleLauncher {
		runLauncherHelper(t)
	}
}

// runLauncherHelper starts the managed runtime with the actual Start through
// a bounded context, publishes the public result frame and returns normally.
func runLauncherHelper(t *testing.T) {
	t.Helper()
	dataDir := os.Getenv(helperDataEnv)
	cacheDir := os.Getenv(helperCacheEnv)
	resultPath := os.Getenv(helperResultEnv)
	if dataDir == "" || cacheDir == "" || resultPath == "" {
		t.Fatal("the launcher helper requires explicit data, cache and result paths")
	}
	manager, err := New(Options{DataDir: dataDir, CacheDir: cacheDir, Node: "node", Port: 0, NoOpen: true})
	if err != nil {
		t.Fatal(err)
	}
	launcherSID, err := testSessionID(os.Getpid())
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	begin := time.Now()
	result, err := manager.Start(ctx)
	frame := launcherFrame{OK: err == nil, ElapsedMs: time.Since(begin).Milliseconds(), LauncherSID: launcherSID}
	if err != nil {
		frame.Error = err.Error()
	} else {
		frame.Result = &result
	}
	writeLauncherFrame(t, resultPath, frame)
}

func writeLauncherFrame(t *testing.T, path string, frame launcherFrame) {
	t.Helper()
	data, err := json.Marshal(frame)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
}

// runLauncherHelperProcess executes the compiled test binary as a launcher
// helper, waits for its real exit and returns the published frame.
func runLauncherHelperProcess(t *testing.T, dataDir, cacheDir, resultPath string) launcherFrame {
	t.Helper()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	command := exec.Command(executable, "-test.run", helperTestRun, "-test.timeout", "90s")
	command.Env = append(helperEnvironment(), []string{
		helperRoleEnv + "=" + helperRoleLauncher,
		helperDataEnv + "=" + dataDir,
		helperCacheEnv + "=" + cacheDir,
		helperResultEnv + "=" + resultPath,
	}...)
	output := &strings.Builder{}
	command.Stdout = output
	command.Stderr = output
	if err := command.Run(); err != nil {
		t.Fatalf("the launcher helper must exit normally: %v %s", err, boundedText(output.String()))
	}
	data, err := os.ReadFile(resultPath)
	if err != nil {
		t.Fatalf("the launcher helper must publish its result frame: %v %s", err, boundedText(output.String()))
	}
	var frame launcherFrame
	if err := json.Unmarshal(data, &frame); err != nil {
		t.Fatalf("the launcher result frame must decode: %v", err)
	}
	if !frame.OK {
		t.Fatalf("the launcher helper must start the runtime: %s", frame.Error)
	}
	if frame.Result == nil {
		t.Fatal("the started launcher helper must publish its public result")
	}
	return frame
}

// helperEnvironment drops inherited NODE_OPTIONS so no test-control preload
// can leak into the helper's managed Node child.
func helperEnvironment() []string {
	env := []string{}
	for _, entry := range os.Environ() {
		if strings.HasPrefix(entry, "NODE_OPTIONS=") {
			continue
		}
		env = append(env, entry)
	}
	return env
}

func boundedText(text string) string {
	text = strings.TrimSpace(text)
	if len(text) > 2048 {
		return text[:2048]
	}
	return text
}
