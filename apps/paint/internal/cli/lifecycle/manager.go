package lifecycle

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// Options configures a lifecycle Manager. The zero Port means ephemeral and
// is never defaulted to the production port; callers start from
// DefaultOptions and override the fields they need.
type Options struct {
	DataDir  string
	CacheDir string
	Node     string
	Port     int
	NoOpen   bool
}

// State describes the lifecycle state of the managed runtime, independently
// of playback.
type State string

const (
	Stopped  State = "stopped"
	Running  State = "running"
	Stopping State = "stopping"
)

// Result describes a verified managed runtime. It never carries capability
// material.
type Result struct {
	URL        string `json:"url"`
	InstanceID string `json:"instanceId"`
	Digest     string `json:"digest"`
	PID        int    `json:"pid"`
	State      State  `json:"state"`
}

// Manager owns the native lifecycle of the embedded studio runtime. Its
// constructor validates and normalizes configuration only: it touches no
// files, starts no processes and extracts no cache content.
type Manager struct {
	dataDir  string
	cacheDir string
	node     string
	port     int
	noOpen   bool
	digest   string
}

const (
	// lifecycleLockName serializes lifecycle manager operations inside the
	// private data directory.
	lifecycleLockName = ".lifecycle.lock"
	// writerLockName is the writer lease the Node runtime inherits for its
	// whole life: the parent closes its own descriptor immediately after a
	// successful start, so the child alone holds the lease.
	writerLockName = ".writer.lock"
)

// DefaultOptions resolves the durable data and cache defaults, the default
// executable name and the production port. It reads no files beyond the
// user environment and creates nothing.
func DefaultOptions() (Options, error) {
	dataDir, err := os.UserConfigDir()
	if err != nil {
		return Options{}, err
	}
	cacheDir, err := os.UserCacheDir()
	if err != nil {
		return Options{}, err
	}
	return Options{
		DataDir:  filepath.Join(dataDir, "codesketch"),
		CacheDir: filepath.Join(cacheDir, "codesketch"),
		Node:     "node",
		Port:     4317,
	}, nil
}

// New validates explicit options, normalizes the directories to absolute
// paths and freezes the current embedded runtime digest in memory. Port 0 is
// preserved; an explicit port must be in 1024..65535. macOS and Linux are
// the only supported platforms.
func New(opts Options) (*Manager, error) {
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		return nil, errors.New("native lifecycle supports macOS and Linux only")
	}
	if opts.DataDir == "" {
		return nil, errors.New("lifecycle data directory must be nonempty")
	}
	if opts.CacheDir == "" {
		return nil, errors.New("lifecycle cache directory must be nonempty")
	}
	if opts.Node == "" {
		return nil, errors.New("lifecycle node executable must be nonempty")
	}
	if !validPort(opts.Port) {
		return nil, fmt.Errorf("lifecycle port must be 0 or between 1024 and 65535: %d", opts.Port)
	}
	dataDir, err := filepath.Abs(opts.DataDir)
	if err != nil {
		return nil, err
	}
	cacheDir, err := filepath.Abs(opts.CacheDir)
	if err != nil {
		return nil, err
	}
	_, digest, err := runtimeManifest()
	if err != nil {
		return nil, err
	}
	return &Manager{
		dataDir:  dataDir,
		cacheDir: cacheDir,
		node:     opts.Node,
		port:     opts.Port,
		noOpen:   opts.NoOpen,
		digest:   digest,
	}, nil
}

func validPort(port int) bool {
	return port == 0 || (port >= 1024 && port <= 65535)
}

// Status reports the discovered runtime state. It requires neither the Node
// executable nor cache extraction: the expected digest is the embedded one,
// and classification only reads data-directory metadata under the operation
// lock and probes the recorded loopback endpoint.
func (m *Manager) Status(ctx context.Context) (Result, error) {
	discovered, err := m.discover(ctx)
	if err != nil {
		return Result{}, err
	}
	// Status never starts a runtime, so the probe lease is dropped here; a
	// future start retains it through preparation and transfer.
	if discovered.lease != nil {
		discovered.lease.Close()
	}
	return discovered.result, nil
}
