package lifecycle

import (
	"os"
	"path/filepath"
	"testing"
)

// recoverySeedJSON holds the exact recovery envelope generated and validated
// at packaging time from the real Session fixture semantics: one committed
// stroke, a partial active stroke with queued work, and one open comment.
// The bytes were round-tripped through the strict restoreRecovery validator
// before being embedded, and every managed launch below revalidates them
// again before listening, so a successful launch proves the seed survives
// the current-only recovery contract. No checkout access happens at runtime.
const recoverySeedJSON = `{"format":"codesketch-recovery","version":1,"project":{"format":"codesketch","version":2,"commands":[{"type":"stroke","layer":"paint","color":"#253d38","opacity":1,"points":[[0,0],[100,0]],"size":8,"brush":"brush"}],"cursor":1,"queue":[{"type":"stroke","layer":"paint","color":"#253d38","opacity":1,"points":[[5,5],[60,60]],"size":8,"brush":"brush"},{"type":"fill","color":"#112233"}],"comments":[{"id":"e336e555-941b-4cf4-a29e-20563ec23dc4","number":1,"seq":1,"text":"Fix the river bank shading","rect":{"x":10,"y":20,"width":120,"height":80},"status":"open","cursor":1,"artRevision":2,"at":"2026-09-10T09:06:53.863Z","acknowledgedAt":null,"addressedAt":null,"resolvedAt":null,"visibleLayers":[{"id":"paint","opacity":1}],"request":null}]},"active":{"progress":0.07071067811865475},"speed":0.25}`

// seedRecovery writes the exact embedded seed bytes as the private recovery
// file of the case data directory before the first launch.
func seedRecovery(t *testing.T, dataDir string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dataDir, "recovery.json"), []byte(recoverySeedJSON+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
}
