//go:build !windows

package input

import (
	"os"
	"syscall"
)

func openRegular(path string) (*os.File, error) {
	// O_NONBLOCK prevents named pipes from hanging before the type check.
	f, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NONBLOCK, 0)
	if err != nil {
		return nil, err
	}
	return checkRegular(f)
}
