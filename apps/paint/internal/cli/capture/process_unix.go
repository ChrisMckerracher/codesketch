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

// terminateProcess stops the fresh child's owned process group through
// syscall.Kill against the negative owned pgid.
func terminateProcess(cmd *exec.Cmd) error {
	return terminateProcessWithSignal(cmd, func(pid int, sig syscall.Signal) error {
		return syscall.Kill(-pid, sig)
	})
}

// terminateProcessWithSignal stops the owned browser group through the
// existing TERM grace, KILL escalation, and bounded disappearance
// verification. The signal parameter is the seam for deterministic errno
// regressions. On Darwin an owned group containing only zombies returns EPERM
// until it disappears, so EPERM is a pending condition: it is saved and
// cleanup continues. Only signal 0 returning ESRCH proves the group is gone;
// unexpected syscall errors fail immediately. All pending errors accumulate
// and surface joined with any fatal or deadline error, so distinct errnos
// such as EPERM and EINVAL remain simultaneously checkable with errors.Is.
// The total cleanup budget is unchanged.
func terminateProcessWithSignal(cmd *exec.Cmd, signal func(int, syscall.Signal) error) error {
	pid := cmd.Process.Pid
	var pending []error
	termErr := signalGroup(pid, syscall.SIGTERM, signal, "terminate browser group")
	if termErr != nil && !errors.Is(termErr, syscall.EPERM) {
		return termErr
	}
	pending = append(pending, termErr)
	gone, probePending, fatal := disappeared(pid, signal, 500*time.Millisecond)
	pending = append(pending, probePending)
	if fatal != nil {
		return errors.Join(append(pending, fatal)...)
	}
	if gone {
		return nil
	}
	killErr := signalGroup(pid, syscall.SIGKILL, signal, "kill browser group")
	if killErr != nil && !errors.Is(killErr, syscall.EPERM) {
		return errors.Join(append(pending, killErr)...)
	}
	pending = append(pending, killErr)
	gone, probePending, fatal = disappeared(pid, signal, time.Second)
	pending = append(pending, probePending)
	if fatal != nil {
		return errors.Join(append(pending, fatal)...)
	}
	if gone {
		return nil
	}
	saved := errors.Join(pending...)
	if saved == nil {
		saved = errors.New("group remained signalable after both signals")
	}
	return fmt.Errorf("capture browser process group with owned pgid %d survived cleanup deadline: %w", pid, saved)
}

// signalGroup delivers one group signal. ESRCH means nothing was signalable
// and is not an error; the disappearance verification still decides success.
// A saved EPERM only surfaces if the group fails to disappear within its
// window.
func signalGroup(pid int, sig syscall.Signal, kill func(int, syscall.Signal) error, action string) error {
	err := kill(pid, sig)
	switch {
	case err == nil, errors.Is(err, syscall.ESRCH):
		return nil
	case errors.Is(err, syscall.EPERM):
		return fmt.Errorf("%s with owned pgid %d: %w (pending zombie-group denial)", action, pid, err)
	default:
		return fmt.Errorf("%s with owned pgid %d: %w", action, pid, err)
	}
}

// disappeared polls signal 0 until the group provably disappears (ESRCH),
// the window expires, or an unexpected error surfaces. It returns whether the
// group is gone, a pending error saved from the first probe EPERM while
// polling continues, and a fatal error for any unexpected probe failure with
// the pending error retained.
func disappeared(pid int, kill func(int, syscall.Signal) error, window time.Duration) (bool, error, error) {
	deadline := time.Now().Add(window)
	var pending error
	for {
		err := kill(pid, 0)
		switch {
		case errors.Is(err, syscall.ESRCH):
			return true, pending, nil
		case err == nil:
			// Present; keep polling.
		case errors.Is(err, syscall.EPERM):
			// Pending zombie-only group; save once and keep polling.
			if pending == nil {
				pending = fmt.Errorf("verify capture browser group with owned pgid %d: %w (pending zombie-group denial)", pid, err)
			}
		default:
			return false, pending, fmt.Errorf("verify capture browser group with owned pgid %d: %w", pid, err)
		}
		if !time.Now().Before(deadline) {
			return false, pending, nil
		}
		time.Sleep(20 * time.Millisecond)
	}
}
