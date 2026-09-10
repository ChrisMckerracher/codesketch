package lifecycle

import (
	"context"
	"net/http"
	"sync"
	"testing"
	"time"
)

// TestStartAndRestartConcurrentCallersSerialiseUnderOperationLock releases
// two Start callers and one Restart together: the operation lock serialises
// them, so every call succeeds, each Start reports either the initial or the
// replacement identity according to its serialized position, and the final
// status equals the Restart result with the writer exclusively held.
func TestStartAndRestartConcurrentCallersSerialiseUnderOperationLock(t *testing.T) {
	nodeAvailable(t)
	manager, dataDir, _ := newStartManager(t)
	initial, err := manager.Start(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupAcceptedRuntime(t, dataDir) })
	studioRoute(t, initial.URL, http.MethodPost, "/api/commands",
		humanSeed(t, initial.URL, `{"type":"fill","color":"#334455"}`))

	gate := make(chan struct{})
	starts := make([]Result, 2)
	startErrs := make([]error, 2)
	var restart Result
	var restartErr error
	var group sync.WaitGroup
	group.Add(3)
	for slot := 0; slot < 2; slot++ {
		go func(slot int) {
			defer group.Done()
			<-gate
			ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
			defer cancel()
			starts[slot], startErrs[slot] = manager.Start(ctx)
		}(slot)
	}
	go func() {
		defer group.Done()
		<-gate
		ctx, cancel := context.WithTimeout(t.Context(), 90*time.Second)
		defer cancel()
		restart, restartErr = manager.Restart(ctx)
	}()
	close(gate)
	group.Wait()

	for slot := 0; slot < 2; slot++ {
		if startErrs[slot] != nil {
			t.Fatal(startErrs[slot])
		}
		if starts[slot].State != Running || starts[slot].InstanceID == "" {
			t.Fatalf("every Start caller must report a running runtime: %+v", starts[slot])
		}
		if starts[slot].InstanceID != initial.InstanceID && starts[slot].InstanceID != restart.InstanceID {
			t.Fatalf("a Start caller must report the initial or replacement identity: %+v vs %+v %+v", starts[slot], initial, restart)
		}
	}
	if restartErr != nil {
		t.Fatal(restartErr)
	}
	if restart.State != Running || restart.InstanceID == "" || restart.URL == "" || restart.PID <= 0 {
		t.Fatalf("the Restart caller must report the accepted replacement: %+v", restart)
	}
	final, err := manager.Status(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if final != restart {
		t.Fatalf("the final status must equal the Restart result: %+v vs %+v", final, restart)
	}
	record, err := readRecord(dataDir)
	if err != nil || record.InstanceID != restart.InstanceID {
		t.Fatalf("the record must describe the replacement: %+v %v", record, err)
	}
	if lease, acquired, leaseErr := probeWriterLease(t.Context(), dataDir); leaseErr != nil || acquired || lease != nil {
		t.Fatalf("the replacement must hold the writer lease exclusively: %v %v", acquired, leaseErr)
	}
}
