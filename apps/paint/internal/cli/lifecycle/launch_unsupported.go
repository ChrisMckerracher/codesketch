//go:build !darwin && !linux

package lifecycle

import "syscall"

// launchSysProcAttr is never reached: New rejects unsupported platforms
// before any launch.
func launchSysProcAttr() *syscall.SysProcAttr {
	return nil
}
