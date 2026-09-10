//go:build !darwin && !linux

package capture

import (
	"errors"
	"os/exec"
)

func configureProcess(*exec.Cmd) error {
	return errors.New("native capture requires macOS or Linux process-group cleanup; this platform is not yet supported")
}

func terminateProcess(*exec.Cmd) error { return nil }
