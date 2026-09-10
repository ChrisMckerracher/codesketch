package lifecycle

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

const (
	// recordName is the exact sole ownership record file inside the private
	// data directory.
	recordName = "lifecycle.json"
	// recordLimit bounds the ownership record file size.
	recordLimit = 16 * 1024
	// maxSafePID is the positive integer bound aligned with the Node wire.
	maxSafePID = 1<<53 - 1
)

// ownershipRecord is the exact ownership record schema. Go only reads it;
// Node publishes and removes it.
type ownershipRecord struct {
	InstanceID string `json:"instanceId"`
	PID        int    `json:"pid"`
	URL        string `json:"url"`
	Digest     string `json:"digest"`
	Capability string `json:"capability"`
}

// readRecord reads and validates the ownership record inside dataDir. The
// file must be a private regular file owned by the current user, at most
// recordLimit bytes, containing exactly the frozen keys. Validation errors
// name the failing field and never quote record or capability material.
func readRecord(dataDir string) (ownershipRecord, error) {
	path := filepath.Join(dataDir, recordName)
	// nonBlockOpen keeps a hostile FIFO at the record path from blocking the
	// open; the fstat regular-file check rejects it before any read.
	fd, err := openFileNoFollow(path, syscall.O_RDONLY|nonBlockOpen, 0)
	if err != nil {
		return ownershipRecord{}, err
	}
	file := os.NewFile(uintptr(fd), path)
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return ownershipRecord{}, err
	}
	if !info.Mode().IsRegular() {
		return ownershipRecord{}, fmt.Errorf("%s: ownership record must be a regular file", path)
	}
	if !ownedByCurrentUser(info) {
		return ownershipRecord{}, fmt.Errorf("%s: ownership record must be owned by the current user", path)
	}
	if info.Mode().Perm()&0o077 != 0 {
		return ownershipRecord{}, fmt.Errorf("%s: ownership record must be private", path)
	}
	if info.Size() > recordLimit {
		return ownershipRecord{}, fmt.Errorf("%s: ownership record exceeds the %d byte limit", path, recordLimit)
	}
	data, err := io.ReadAll(io.LimitReader(file, recordLimit+1))
	if err != nil {
		return ownershipRecord{}, err
	}
	if int64(len(data)) > recordLimit {
		return ownershipRecord{}, fmt.Errorf("%s: ownership record exceeds the %d byte limit", path, recordLimit)
	}
	return parseRecord(path, data)
}

// parseRecord validates the exact record encoding and field values. JSON
// object keys must be exactly the five frozen case-sensitive names before
// typed decoding, because struct decoding would otherwise accept case
// variants.
func parseRecord(path string, data []byte) (ownershipRecord, error) {
	var keys map[string]json.RawMessage
	decoder := json.NewDecoder(bytes.NewReader(data))
	if err := decoder.Decode(&keys); err != nil {
		return ownershipRecord{}, fmt.Errorf("%s: ownership record must decode to the exact schema", path)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return ownershipRecord{}, fmt.Errorf("%s: ownership record must be exactly one JSON object", path)
	}
	expected := []string{"instanceId", "pid", "url", "digest", "capability"}
	if len(keys) != len(expected) {
		return ownershipRecord{}, fmt.Errorf("%s: ownership record must contain exactly the frozen keys", path)
	}
	for _, key := range expected {
		if _, ok := keys[key]; !ok {
			return ownershipRecord{}, fmt.Errorf("%s: ownership record key %s is missing or misspelled", path, key)
		}
	}
	var record ownershipRecord
	if err := json.Unmarshal(data, &record); err != nil {
		return ownershipRecord{}, fmt.Errorf("%s: ownership record must decode to the exact schema", path)
	}
	switch {
	case record.InstanceID == "" || len(record.InstanceID) > 256:
		return ownershipRecord{}, fmt.Errorf("%s: ownership record instanceId must be 1 to 256 characters", path)
	case record.PID <= 0 || record.PID > maxSafePID:
		return ownershipRecord{}, fmt.Errorf("%s: ownership record pid must be a positive Node-safe integer", path)
	case !validRecordURL(record.URL):
		return ownershipRecord{}, fmt.Errorf("%s: ownership record url must be the literal loopback form", path)
	case !hex64(record.Digest):
		return ownershipRecord{}, fmt.Errorf("%s: ownership record digest must be 64 lowercase hex characters", path)
	case !hex64(record.Capability):
		return ownershipRecord{}, fmt.Errorf("%s: ownership record capability must be 64 lowercase hex characters", path)
	}
	return record, nil
}

// validRecordURL requires the strict literal form http://127.0.0.1:PORT with
// a canonical explicit port and no path, query, credentials or fragment.
func validRecordURL(rawURL string) bool {
	const prefix = "http://127.0.0.1:"
	if !strings.HasPrefix(rawURL, prefix) {
		return false
	}
	port := rawURL[len(prefix):]
	value, err := strconv.Atoi(port)
	if err != nil || value < 1 || value > 65535 || strconv.Itoa(value) != port {
		return false
	}
	return true
}

// hex64 requires exactly 64 lowercase hexadecimal characters.
func hex64(value string) bool {
	if len(value) != 64 {
		return false
	}
	for _, r := range value {
		switch {
		case r >= '0' && r <= '9', r >= 'a' && r <= 'f':
		default:
			return false
		}
	}
	return true
}
