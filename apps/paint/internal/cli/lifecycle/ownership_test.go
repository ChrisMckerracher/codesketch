package lifecycle

import (
	"os"
	"syscall"
	"testing"
	"time"
)

type ownershipFixture struct {
	mode os.FileMode
	uid  uint32
}

func (f ownershipFixture) Name() string       { return "fixture" }
func (f ownershipFixture) Size() int64        { return 0 }
func (f ownershipFixture) Mode() os.FileMode  { return f.mode }
func (f ownershipFixture) ModTime() time.Time { return time.Time{} }
func (f ownershipFixture) IsDir() bool        { return f.mode.IsDir() }
func (f ownershipFixture) Sys() any           { return &syscall.Stat_t{Uid: f.uid} }

func TestOwnedByCurrentUserRejectsForeignOwner(t *testing.T) {
	current := uint32(os.Getuid())
	if !ownedByCurrentUser(ownershipFixture{mode: 0o700 | os.ModeDir, uid: current}) {
		t.Fatal("current owner must pass the ownership check")
	}
	if ownedByCurrentUser(ownershipFixture{mode: 0o700 | os.ModeDir, uid: current ^ 1}) {
		t.Fatal("foreign owner must be rejected without touching user files")
	}
}
