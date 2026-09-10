//go:build !darwin && !linux

package lifecycle

import "errors"

// testSessionID is the test-only unsupported-platform helper: native
// lifecycle session identity is a Unix contract, and unsupported platforms
// already fail construction before any session assertion can run.
func testSessionID(pid int) (int, error) {
	return 0, errors.New("session identifiers are unsupported on this platform")
}
