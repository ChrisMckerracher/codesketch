package lifecycle

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// The case owns this MkdirTemp root exclusively. Failed cleanup preserves
// it; no t.TempDir remover can delete persistence under an unjoined process.
type orphanCaseRoot struct {
	t         *testing.T
	root      string
	dataDir   string
	launchers []*orphanLauncher
	endpoints []string
}

func ownOrphanCaseRoot(t *testing.T) *orphanCaseRoot {
	t.Helper()
	root, err := os.MkdirTemp("", "codesketch-orphan-")
	if err != nil {
		t.Fatal(err)
	}
	owned := &orphanCaseRoot{t: t, root: root}
	t.Cleanup(owned.dispose)
	return owned
}

func (o *orphanCaseRoot) trackEndpoint(rawURL string) {
	for _, known := range o.endpoints {
		if known == rawURL {
			return
		}
	}
	o.endpoints = append(o.endpoints, rawURL)
}

func orphanPrivateEndpoint(rawURL string) bool {
	return validRecordURL(rawURL) && rawURL != "http://127.0.0.1:4317"
}

func (o *orphanCaseRoot) dispose() {
	// Before a successful launch there is no process to prove stopped, and
	// an unset dataDir must never reach discovery or any manager defaults.
	if len(o.launchers) == 0 {
		if err := os.RemoveAll(o.root); err != nil {
			o.t.Errorf("remove unstarted case %s: %v", o.root, err)
		}
		return
	}
	var failures []string
	if err := os.WriteFile(filepath.Join(o.root, "control", "crash.flag"), nil, 0o600); err != nil {
		failures = append(failures, "write self-crash flag: "+err.Error())
	}
	for _, launcher := range o.launchers {
		if err := launcher.terminate(10 * time.Second); err != nil {
			failures = append(failures, err.Error())
		}
	}
	// Still attempt resource cleanup after an unproved join, but preserve
	// the root even if the endpoint and lease subsequently look released.
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	if o.dataDir == "" || o.dataDir != filepath.Join(o.root, "data") {
		failures = append(failures, "the owned private data directory is unset or unexpected")
	} else if err := o.awaitReleaseProof(ctx); err != nil {
		failures = append(failures, err.Error())
	}
	if len(failures) != 0 {
		o.t.Errorf("orphan cleanup failed; retained private root %s: %s", o.root, strings.Join(failures, "; "))
		return
	}
	if err := os.RemoveAll(o.root); err != nil {
		o.t.Errorf("remove proved-idle case %s: %v", o.root, err)
	}
}

// Retry discovery after joining the launcher: it may have published an
// accepted runtime after an earlier absent-record observation. Remember its
// endpoint before Stop can remove the record. A free writer lease is held
// throughout every endpoint probe and is closed on every return path.
func (o *orphanCaseRoot) awaitReleaseProof(ctx context.Context) error {
	var lastStop error
	for ctx.Err() == nil {
		// A failed assertion may precede the outer test's marker bookkeeping.
		if data, err := os.ReadFile(filepath.Join(o.root, orphanPhaseMarkerName)); err == nil {
			var marker struct {
				URL string `json:"url"`
			}
			if json.Unmarshal(data, &marker) == nil && marker.URL != "" {
				o.trackEndpoint(marker.URL)
			}
		}
		record, err := readRecord(o.dataDir)
		if err == nil {
			o.trackEndpoint(record.URL)
			lastStop = orphanTryStop(ctx, record)
		} else if !os.IsNotExist(err) {
			return fmt.Errorf("cleanup cannot inspect ownership: %w", err)
		}
		lease, acquired, err := probeWriterLease(ctx, o.dataDir)
		refused := acquired && err == nil
		if refused {
			for _, endpoint := range o.endpoints {
				if !orphanPrivateEndpoint(endpoint) || !endpointRefused(ctx, endpoint) {
					refused = false
					break
				}
			}
		}
		if lease != nil {
			if closeErr := lease.Close(); closeErr != nil {
				return fmt.Errorf("close cleanup writer probe: %w", closeErr)
			}
		}
		if refused && ctx.Err() == nil {
			return nil
		}
		select {
		case <-ctx.Done():
		case <-time.After(100 * time.Millisecond):
		}
	}
	return fmt.Errorf("endpoint refusal and writer release unproved for %v: %w; last Stop: %v", o.endpoints, ctx.Err(), lastStop)
}

// Connection refusal after self-crash is expected; only final endpoint and
// lease proof decides cleanup success. The request uses the independent
// cleanup deadline, a bounded direct client, and the private capability.
func orphanTryStop(ctx context.Context, record ownershipRecord) error {
	if !orphanPrivateEndpoint(record.URL) {
		return fmt.Errorf("cleanup endpoint is not an isolated loopback runtime")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, record.URL+"/api/lifecycle/stop",
		strings.NewReader(fmt.Sprintf(`{"instanceId":%q}`, record.InstanceID)))
	if err != nil {
		return err
	}
	request.Header.Set(capabilityHeader, record.Capability)
	request.Header.Set("Content-Type", "application/json")
	client := newDirectClient(2 * time.Second)
	defer client.CloseIdleConnections()
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("authenticated Stop returned %d", response.StatusCode)
	}
	return nil
}
