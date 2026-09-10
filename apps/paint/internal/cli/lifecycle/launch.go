package lifecycle

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const (
	// startupDeadline bounds the whole launch and acceptance even when the
	// caller supplies no deadline.
	startupDeadline = 30 * time.Second
	// launchFrameLimit bounds the single readiness frame.
	launchFrameLimit = 16 * 1024
	// diagnosticLimit matches the Node stderr budget.
	diagnosticLimit = 64 * 1024
	// diagnosticQuota bounds how much of the log a failure message quotes.
	diagnosticQuota = 2048
)

// launchInput is the exact frozen stdin object.
type launchInput struct {
	DataDir    string `json:"dataDir"`
	Port       int    `json:"port"`
	Capability string `json:"capability"`
	Digest     string `json:"digest"`
}

// launch extracts-free entrypoint: it starts the managed entrypoint as a
// detached direct child with the lease on fd 3 and a real readiness pipe on
// fd 4, closes the parent lease without unlocking right after a successful
// start, and accepts the runtime only after comparing the readiness frame,
// durable record, authenticated HTTP status, current digest, intended
// capability, direct child PID and requested port. Only pre-acceptance
// failure kills the retained child.
func (m *Manager) launch(ctx context.Context, lease *os.File, root string) (Result, error) {
	startupCtx := ctx
	if deadline, ok := ctx.Deadline(); !ok || time.Until(deadline) > startupDeadline {
		var cancel context.CancelFunc
		startupCtx, cancel = context.WithTimeout(ctx, startupDeadline)
		defer cancel()
	}
	capability, err := launchCapability()
	if err != nil {
		lease.Close()
		return Result{}, err
	}
	input, err := json.Marshal(launchInput{DataDir: m.dataDir, Port: m.port, Capability: capability, Digest: m.digest})
	if err != nil {
		lease.Close()
		return Result{}, err
	}
	readyRead, readyWrite, err := os.Pipe()
	if err != nil {
		lease.Close()
		return Result{}, err
	}
	log, err := os.CreateTemp(m.cacheDir, ".managed-*.log")
	if err != nil {
		readyRead.Close()
		readyWrite.Close()
		lease.Close()
		return Result{}, err
	}
	cmd := exec.Command(m.node, filepath.Join(root, "src", "transport", "managed.mjs"))
	cmd.Dir = root
	cmd.Stdin = bytes.NewReader(input)
	cmd.Stdout = log
	cmd.Stderr = log
	cmd.ExtraFiles = []*os.File{lease, readyWrite}
	cmd.SysProcAttr = launchSysProcAttr()
	if err := cmd.Start(); err != nil {
		readyRead.Close()
		readyWrite.Close()
		lease.Close()
		log.Close()
		os.Remove(log.Name())
		return Result{}, fmt.Errorf("lifecycle start failed: %w", err)
	}
	// The child inherited duplicated descriptors: dropping the parent lease
	// keeps the writer lock held, and the child owns the write end now.
	lease.Close()
	readyWrite.Close()
	completion := &childCompletion{done: make(chan struct{})}
	go func() {
		completion.err = cmd.Wait()
		close(completion.done)
	}()
	frame, acceptErr := m.awaitReadiness(startupCtx, readyRead, completion)
	if acceptErr == nil {
		var identity statusResponse
		// Acceptance stays inside the bounded startup context; cancellation
		// is re-checked immediately before the successful return.
		identity, acceptErr = m.acceptRuntime(startupCtx, frame, capability, cmd.Process.Pid)
		if acceptErr == nil {
			acceptErr = ensureLive(startupCtx)
		}
		if acceptErr == nil {
			os.Remove(log.Name())
			log.Close()
			readyRead.Close()
			return Result{URL: identity.URL, InstanceID: identity.InstanceID, Digest: m.digest, PID: cmd.Process.Pid, State: Running}, nil
		}
	}
	if acceptErr != nil {
		return Result{}, m.abortLaunch(cmd, completion, log, readyRead, capability, acceptErr)
	}
	return Result{}, errors.New("lifecycle start failed")
}

// awaitReadiness reads the single bounded newline-terminated frame while
// monitoring child exit and the startup deadline.
//
// childCompletion is the single reusable completion signal for the one Wait
// owner: the result is stored before the channel closes so readiness
// monitoring and abort cleanup can both observe it.
type childCompletion struct {
	done chan struct{}
	err  error
}

func (c *childCompletion) wait() error {
	<-c.done
	return c.err
}

func (m *Manager) awaitReadiness(ctx context.Context, readyRead *os.File, completion *childCompletion) ([]byte, error) {
	frames := make(chan []byte, 1)
	failures := make(chan error, 1)
	go func() {
		frame, err := readReadyFrame(readyRead)
		if err != nil {
			failures <- err
		} else {
			frames <- frame
		}
	}()
	select {
	case frame := <-frames:
		return frame, nil
	case err := <-failures:
		// When the child also exited, its exit is the deeper cause; give the
		// wait owner a short grace window to report it.
		grace := time.NewTimer(2 * time.Second)
		defer grace.Stop()
		select {
		case <-completion.done:
			if completion.err == nil {
				return nil, errors.New("lifecycle child exited cleanly before readiness")
			}
			return nil, fmt.Errorf("lifecycle child exited during startup: %w", completion.err)
		case <-grace.C:
		}
		return nil, fmt.Errorf("lifecycle readiness failed: %w", err)
	case <-completion.done:
		if completion.err == nil {
			return nil, errors.New("lifecycle child exited cleanly before readiness")
		}
		return nil, fmt.Errorf("lifecycle child exited during startup: %w", completion.err)
	case <-ctx.Done():
		return nil, fmt.Errorf("lifecycle startup did not complete: %w", ctx.Err())
	}
}

// acceptRuntime validates the readiness frame against the durable record,
// the intended capability, the direct child PID, the requested port and an
// authenticated HTTP status before the runtime is accepted.
func (m *Manager) acceptRuntime(ctx context.Context, frame []byte, capability string, pid int) (statusResponse, error) {
	pipe, err := parseStatusBody(frame)
	if err != nil {
		return statusResponse{}, err
	}
	if pipe.State != string(Running) {
		return statusResponse{}, errors.New("the readiness frame state is not running")
	}
	record, err := readRecord(m.dataDir)
	if err != nil {
		return statusResponse{}, fmt.Errorf("lifecycle ownership record is missing after readiness: %w", err)
	}
	if err := ensureLive(ctx); err != nil {
		return statusResponse{}, err
	}
	if pipe.InstanceID != record.InstanceID || pipe.PID != record.PID || pipe.URL != record.URL || pipe.Digest != record.Digest {
		return statusResponse{}, errStatusMismatch
	}
	if record.Capability != capability {
		return statusResponse{}, errors.New("lifecycle ownership record capability does not match the intended launch")
	}
	if record.Digest != m.digest {
		return statusResponse{}, errors.New("lifecycle ownership record digest is incompatible")
	}
	if record.PID != pid {
		return statusResponse{}, errors.New("lifecycle ownership record pid is not the direct child")
	}
	if m.port != 0 && urlPort(record.URL) != m.port {
		return statusResponse{}, fmt.Errorf("lifecycle ownership record url does not carry the requested port %d", m.port)
	}
	response, err := fetchStatus(ctx, record)
	if err != nil {
		return statusResponse{}, fmt.Errorf("lifecycle authenticated status failed after readiness: %w", err)
	}
	if response.State != string(Running) {
		return statusResponse{}, errors.New("lifecycle authenticated status is not running")
	}
	return response, nil
}

// abortLaunch kills and reaps only the retained child, quotes a bounded
// capability-redacted diagnostic tail and removes the diagnostic log. A
// residual record after a failed launch is preserved: the normal next
// discovery owns full stale proof under both locks.
func (m *Manager) abortLaunch(cmd *exec.Cmd, completion *childCompletion, log *os.File, readyRead *os.File, capability string, cause error) error {
	cmd.Process.Kill()
	_ = completion.wait()
	readyRead.Close()
	detail := failureDiagnostics(log, capability)
	os.Remove(log.Name())
	log.Close()
	if detail != "" {
		return fmt.Errorf("%w: %s", cause, detail)
	}
	return cause
}

// failureDiagnostics reads a bounded prefix of the child diagnostics from
// the already-owned log descriptor with the capability redacted.
func failureDiagnostics(log *os.File, capability string) string {
	data := make([]byte, diagnosticLimit+1)
	read, err := log.ReadAt(data, 0)
	// A short read ends with io.EOF when the child wrote less than the
	// buffer: that is the normal bounded diagnostic case, not a failure.
	if err != nil && err != io.EOF {
		return ""
	}
	data = data[:read]
	message := strings.ReplaceAll(string(data), capability, "[redacted]")
	message = strings.TrimSpace(message)
	if len(message) > diagnosticQuota {
		message = message[:diagnosticQuota]
	}
	return message
}

// launchCapability generates the per-launch capability from 32 cryptographically
// random bytes.
func launchCapability() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("lifecycle capability generation failed: %w", err)
	}
	return hex.EncodeToString(raw), nil
}

// readReadyFrame reads through EOF within the 16 KiB budget and accepts
// exactly one newline-terminated JSON object with no trailing frames.
func readReadyFrame(readyRead *os.File) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(readyRead, launchFrameLimit+1))
	if err != nil {
		return nil, fmt.Errorf("the readiness frame must be readable within the 16 KiB bound: %w", err)
	}
	if int64(len(data)) > launchFrameLimit {
		return nil, errors.New("the readiness frame exceeds the 16 KiB bound")
	}
	if len(data) == 0 || data[len(data)-1] != '\n' || bytes.Count(data, []byte{'\n'}) != 1 {
		return nil, errors.New("the readiness frame must be exactly one newline-terminated JSON object")
	}
	return data[:len(data)-1], nil
}
