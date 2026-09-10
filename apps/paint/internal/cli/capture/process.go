package capture

import (
	"errors"
	"fmt"
	"os/exec"
	"time"
)

type browserProcess struct {
	cmd  *exec.Cmd
	done chan struct{}
	err  error
}

func startBrowser(path, profile, url string) (*browserProcess, error) {
	cmd := exec.Command(path,
		"--headless=new", "--no-first-run", "--no-default-browser-check",
		"--disable-background-networking", "--disable-component-update",
		"--disable-sync", "--disable-extensions", "--disable-breakpad",
		"--disable-crash-reporter", "--disable-crashpad-for-testing",
		"--no-proxy-server", "--user-data-dir="+profile, url)
	if err := configureProcess(cmd); err != nil {
		return nil, err
	}
	// Nil streams go directly to the null device, without pipe-copy goroutines
	// that a browser descendant could keep alive after the parent exits.
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start capture browser: %w", err)
	}
	p := &browserProcess{cmd: cmd, done: make(chan struct{})}
	go func() { p.err = cmd.Wait(); close(p.done) }()
	return p, nil
}

func (p *browserProcess) stop() error {
	groupErr := terminateProcess(p.cmd)
	var reapErr error
	select {
	case <-p.done:
	case <-time.After(2 * time.Second):
		reapErr = errors.New("capture browser did not reap within cleanup deadline")
	}
	return errors.Join(groupErr, reapErr)
}
