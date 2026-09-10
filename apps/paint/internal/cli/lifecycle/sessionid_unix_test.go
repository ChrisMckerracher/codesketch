//go:build darwin || linux

package lifecycle

import "syscall"

// testSessionID returns the kernel session identifier of pid through the
// standard-library SYS_GETSID syscall, so the detached-session assertion
// needs no external ps tooling: the Node 22 slim container has no ps and
// macOS ps builds reject the sid keyword. The test process may observe its
// own accepted children and same-user processes.
func testSessionID(pid int) (int, error) {
	sid, _, errno := syscall.Syscall(syscall.SYS_GETSID, uintptr(pid), 0, 0)
	if errno != 0 {
		return 0, errno
	}
	return int(sid), nil
}
