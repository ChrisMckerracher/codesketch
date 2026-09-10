//go:build !darwin && !linux

package lifecycle

import (
	"context"
	"fmt"
	"os"
)

// acquireExtractLock reports the explicit unsupported-platform error: the
// native lifecycle supports macOS and Linux only.
func acquireExtractLock(_ context.Context, _ string) (func(), error) {
	return nil, fmt.Errorf("lifecycle cache extraction supports macOS and Linux only")
}

// ownedByCurrentUser is a no-op outside macOS and Linux: those platforms are
// rejected with the explicit unsupported-platform lock error before any
// cache content is trusted.
func ownedByCurrentUser(_ os.FileInfo) bool {
	return true
}
