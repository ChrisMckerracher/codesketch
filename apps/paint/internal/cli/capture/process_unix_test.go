//go:build darwin || linux

package capture

import (
	"errors"
	"os"
	"os/exec"
	"slices"
	"strings"
	"syscall"
	"testing"
)

const ownedPID = 12345

// fakeSignals scripts pure errno responses for the terminateProcessWithSignal
// seam and asserts every call targets the positive owned PID.
type fakeSignals struct {
	t          *testing.T
	sent       []syscall.Signal
	termCalls  int
	killCalls  int
	probeCalls int
	onTerm     func(call int) error
	onKill     func(call int) error
	onProbe    func(call int) error
}

func newFakeSignals(t *testing.T, onTerm, onKill, onProbe func(int) error) *fakeSignals {
	return &fakeSignals{t: t, onTerm: onTerm, onKill: onKill, onProbe: onProbe}
}

func (f *fakeSignals) signal(pid int, sig syscall.Signal) error {
	if pid != ownedPID {
		f.t.Errorf("signal pid = %d, want owned pid %d", pid, ownedPID)
	}
	f.sent = append(f.sent, sig)
	switch sig {
	case syscall.SIGTERM:
		f.termCalls++
		return f.onTerm(f.termCalls)
	case syscall.SIGKILL:
		f.killCalls++
		return f.onKill(f.killCalls)
	case syscall.Signal(0):
		f.probeCalls++
		return f.onProbe(f.probeCalls)
	default:
		f.t.Fatalf("unexpected signal %v", sig)
		return nil
	}
}

func always(err error) func(int) error {
	return func(int) error { return err }
}

func (f *fakeSignals) wantSent(want ...syscall.Signal) {
	f.t.Helper()
	if !slices.Equal(f.sent, want) {
		f.t.Fatalf("sent signals = %v, want %v", f.sent, want)
	}
}

func ownedCmd() *exec.Cmd {
	return &exec.Cmd{Process: &os.Process{Pid: ownedPID}}
}

func TestTerminateTermEPERMThenProbeESRCHSucceeds(t *testing.T) {
	fs := newFakeSignals(t, always(syscall.EPERM), always(syscall.ESRCH), always(syscall.ESRCH))
	if err := terminateProcessWithSignal(ownedCmd(), fs.signal); err != nil {
		t.Fatalf("terminateProcessWithSignal() = %v, want nil", err)
	}
	fs.wantSent(syscall.SIGTERM, 0)
}

func TestTerminateGroupSurvivesTermGraceUntilKillThenGone(t *testing.T) {
	fs := &fakeSignals{t: t, onTerm: always(syscall.EPERM), onKill: always(syscall.EPERM)}
	fs.onProbe = func(int) error {
		if fs.killCalls == 0 {
			return syscall.EPERM
		}
		return syscall.ESRCH
	}
	if err := terminateProcessWithSignal(ownedCmd(), fs.signal); err != nil {
		t.Fatalf("terminateProcessWithSignal() = %v, want nil", err)
	}
	killAt := slices.Index(fs.sent, syscall.SIGKILL)
	if killAt < 2 || fs.sent[0] != syscall.SIGTERM || fs.sent[1] != 0 {
		t.Fatalf("sent signals = %v, want TERM then probe grace before KILL", fs.sent)
	}
	if len(fs.sent) != killAt+2 || fs.sent[killAt+1] != 0 {
		t.Fatalf("signals after KILL = %v, want one probe 0 proving disappearance", fs.sent[killAt:])
	}
}

func TestTerminatePersistentEPERMReportsEPERM(t *testing.T) {
	fs := newFakeSignals(t, always(syscall.EPERM), always(syscall.EPERM), always(syscall.EPERM))
	err := terminateProcessWithSignal(ownedCmd(), fs.signal)
	if err == nil {
		t.Fatal("terminateProcessWithSignal() = nil, want error for persistent group")
	}
	if !errors.Is(err, syscall.EPERM) {
		t.Fatalf("error = %v, want errors.Is EPERM", err)
	}
}

func TestTerminateDeadlineRetainsProbeEPERM(t *testing.T) {
	fs := newFakeSignals(t, always(nil), always(nil), always(syscall.EPERM))
	err := terminateProcessWithSignal(ownedCmd(), fs.signal)
	if err == nil {
		t.Fatal("terminateProcessWithSignal() = nil, want deadline error for persistent group")
	}
	if !errors.Is(err, syscall.EPERM) {
		t.Fatalf("deadline error = %v, want retained errors.Is EPERM", err)
	}
}

func TestTerminateTermEPERMProbeEINVALJoinsBothErrnos(t *testing.T) {
	fs := newFakeSignals(t, always(syscall.EPERM), always(syscall.EPERM), func(call int) error {
		if call == 1 {
			return syscall.EINVAL
		}
		return syscall.EPERM
	})
	err := terminateProcessWithSignal(ownedCmd(), fs.signal)
	if err == nil {
		t.Fatal("terminateProcessWithSignal() = nil, want fatal probe error")
	}
	if !errors.Is(err, syscall.EPERM) || !errors.Is(err, syscall.EINVAL) {
		t.Fatalf("error = %v, want errors.Is both EPERM and EINVAL", err)
	}
}

func TestTerminateProbeEPERMThenEINVALRetainsBoth(t *testing.T) {
	fs := newFakeSignals(t, always(nil), always(syscall.EPERM), func(call int) error {
		if call == 1 {
			return syscall.EPERM
		}
		return syscall.EINVAL
	})
	err := terminateProcessWithSignal(ownedCmd(), fs.signal)
	if err == nil {
		t.Fatal("terminateProcessWithSignal() = nil, want fatal probe error")
	}
	if !errors.Is(err, syscall.EPERM) || !errors.Is(err, syscall.EINVAL) {
		t.Fatalf("error = %v, want errors.Is both EPERM and EINVAL", err)
	}
	fs.wantSent(syscall.SIGTERM, 0, 0)
}

func TestTerminateKillEINVALAfterPresentProbes(t *testing.T) {
	fs := newFakeSignals(t, always(syscall.EPERM), always(syscall.EINVAL), always(syscall.EPERM))
	err := terminateProcessWithSignal(ownedCmd(), fs.signal)
	if err == nil {
		t.Fatal("terminateProcessWithSignal() = nil, want KILL error")
	}
	if !errors.Is(err, syscall.EPERM) || !errors.Is(err, syscall.EINVAL) {
		t.Fatalf("error = %v, want errors.Is both EPERM and EINVAL", err)
	}
	if fs.probeCalls == 0 {
		t.Fatal("KILL fired without TERM grace probes")
	}
}

func TestTerminateResponsiveGroupStillReportsSurvival(t *testing.T) {
	fs := newFakeSignals(t, always(nil), always(nil), always(nil))
	err := terminateProcessWithSignal(ownedCmd(), fs.signal)
	if err == nil {
		t.Fatal("terminateProcessWithSignal() = nil, want group-survived error")
	}
	if !strings.Contains(err.Error(), "survived") {
		t.Fatalf("error = %v, want group-survived wording", err)
	}
}

func TestTerminateTermEINVALFailsImmediately(t *testing.T) {
	fs := newFakeSignals(t, always(syscall.EINVAL), always(syscall.EPERM), always(syscall.EPERM))
	err := terminateProcessWithSignal(ownedCmd(), fs.signal)
	if err == nil {
		t.Fatal("terminateProcessWithSignal() = nil, want TERM error")
	}
	if !errors.Is(err, syscall.EINVAL) {
		t.Fatalf("error = %v, want errors.Is EINVAL", err)
	}
	fs.wantSent(syscall.SIGTERM)
}
