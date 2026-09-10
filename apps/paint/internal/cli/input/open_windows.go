package input

import (
	"fmt"
	"os"
	"strings"
)

func openRegular(path string) (*os.File, error) {
	// Reject Windows device and named-pipe namespaces before opening.
	p := strings.ReplaceAll(path, "/", `\`)
	if strings.HasPrefix(p, `\\`) {
		return nil, fmt.Errorf("input must be a local regular file")
	}
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("input must be a regular file")
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	return checkRegular(f)
}
