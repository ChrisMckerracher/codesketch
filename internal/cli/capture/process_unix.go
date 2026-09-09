//go:build darwin || linux

package capture

import (
	"errors"
	"fmt"
	"os/exec"
	"syscall"
	"time"
)

func configureProcess(cmd *exec.Cmd) error {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	return nil
}

func terminateProcess(cmd *exec.Cmd) error {
	// The group belongs to this fresh child even if its original parent exited.
	group := -cmd.Process.Pid
	if err := syscall.Kill(group, syscall.SIGTERM); err != nil && !errors.Is(err, syscall.ESRCH) {
		return fmt.Errorf("terminate browser group: %w", err)
	}
	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if errors.Is(syscall.Kill(group, 0), syscall.ESRCH) {
			return nil
		}
		time.Sleep(20 * time.Millisecond)
	}
	if err := syscall.Kill(group, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
		return fmt.Errorf("kill browser group: %w", err)
	}
	deadline = time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if errors.Is(syscall.Kill(group, 0), syscall.ESRCH) {
			return nil
		}
		time.Sleep(20 * time.Millisecond)
	}
	return errors.New("capture browser process group survived cleanup deadline")
}
