//go:build darwin || linux

package lifecycle

import "syscall"

// launchSysProcAttr creates a detached OS session for the managed child so
// launcher or terminal exit does not deliver terminal hangup signals and
// session-scoped cleanup cannot include the accepted server.
func launchSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setsid: true}
}
