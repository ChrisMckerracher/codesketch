package lifecycle

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

const (
	digestMarker     = "aaaa"
	capabilityMarker = "bbbb"
	instanceMarker   = "instance-secret"
)

func validRecordBody() string {
	return fmt.Sprintf(`{"instanceId":%q,"pid":4321,"url":"http://127.0.0.1:49152","digest":%q,"capability":%q}`,
		instanceMarker, strings.Repeat(digestMarker, 16), strings.Repeat(capabilityMarker, 16))
}

func writeRecordFile(t *testing.T, body string, perm os.FileMode) string {
	t.Helper()
	dataDir := filepath.Join(t.TempDir(), "data")
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dataDir, recordName)
	if err := os.WriteFile(path, []byte(body), perm); err != nil {
		t.Fatal(err)
	}
	return dataDir
}

func TestReadRecordAcceptsTheExactSchema(t *testing.T) {
	dataDir := writeRecordFile(t, validRecordBody()+"\n", 0o600)
	record, err := readRecord(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if record.PID != 4321 || record.URL != "http://127.0.0.1:49152" {
		t.Errorf("record fields must round-trip: %+v", record)
	}
}

func TestReadRecordRejectsSchemaDeviations(t *testing.T) {
	base := validRecordBody()
	for name, body := range map[string]string{
		"unknownfield":     `{"instanceId":"x","pid":1,"url":"http://127.0.0.1:49152","digest":"` + strings.Repeat("a", 64) + `","capability":"` + strings.Repeat("b", 64) + `","extra":1}`,
		"empty":            ``,
		"array":            `[]`,
		"trailing":         base + ` {}`,
		"pidzero":          strings.Replace(base, `"pid":4321`, `"pid":0`, 1),
		"pidnegative":      strings.Replace(base, `"pid":4321`, `"pid":-5`, 1),
		"pidfraction":      strings.Replace(base, `"pid":4321`, `"pid":4.5`, 1),
		"pidstring":        strings.Replace(base, `"pid":4321`, `"pid":"4321"`, 1),
		"emptyidentity":    strings.Replace(base, instanceMarker, ``, 1),
		"digestshort":      strings.Replace(base, strings.Repeat(digestMarker, 16), strings.Repeat("a", 63), 1),
		"digestupper":      strings.Replace(base, strings.Repeat(digestMarker, 16), strings.ToUpper(strings.Repeat("a", 64)), 1),
		"capabilitynonhex": strings.Replace(base, strings.Repeat(capabilityMarker, 16), strings.Repeat("g", 64), 1),
		"caseinstanceid":   strings.Replace(base, `"instanceId"`, `"InstanceId"`, 1),
		"uppercasepid":     strings.Replace(base, `"pid"`, `"PID"`, 1),
		"extrakey":         strings.Replace(base, `"pid":4321`, `"pid":4321,"extra":0`, 1),
	} {
		t.Run(name, func(t *testing.T) {
			dataDir := writeRecordFile(t, body, 0o600)
			if _, err := readRecord(dataDir); err == nil {
				t.Fatalf("readRecord must reject %s", name)
			}
		})
	}
}

func TestReadRecordRejectsNonLiteralLoopbackURLs(t *testing.T) {
	base := validRecordBody()
	for _, url := range []string{
		"https://127.0.0.1:49152",
		"http://127.0.0.2:49152",
		"http://127.0.0.1:0",
		"http://127.0.0.1:65536",
		"http://127.0.0.1:",
		"http://127.0.0.1:080",
		"http://127.0.0.1:49152/",
		"http://127.0.0.1:49152?x=1",
		"http://127.0.0.1:49152#frag",
		"http://user@127.0.0.1:49152",
		"http://127.0.0.1:049152",
	} {
		body := strings.Replace(base, `"url":"http://127.0.0.1:49152"`, fmt.Sprintf(`"url":%q`, url), 1)
		dataDir := writeRecordFile(t, body, 0o600)
		if _, err := readRecord(dataDir); err == nil {
			t.Errorf("readRecord must reject url %s", url)
		}
	}
}

func TestReadRecordRejectsUnusableRecordFiles(t *testing.T) {
	t.Run("oversized", func(t *testing.T) {
		dataDir := writeRecordFile(t, strings.Repeat("x", recordLimit+1), 0o600)
		if _, err := readRecord(dataDir); err == nil || !strings.Contains(err.Error(), "limit") {
			t.Fatalf("oversized record must hit the bounded limit: %v", err)
		}
	})
	t.Run("symlink", func(t *testing.T) {
		dataDir, path := writeRecordFilePaths(t, validRecordBody(), 0o600)
		if err := os.Remove(path); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(filepath.Join(dataDir, "target"), path); err != nil {
			t.Fatal(err)
		}
		if _, err := readRecord(dataDir); err == nil || !strings.Contains(err.Error(), "symlink") {
			t.Fatalf("symlinked record must be rejected: %v", err)
		}
	})
	t.Run("directory", func(t *testing.T) {
		dataDir := filepath.Join(t.TempDir(), "data")
		if err := os.MkdirAll(filepath.Join(dataDir, recordName), 0o700); err != nil {
			t.Fatal(err)
		}
		if _, err := readRecord(dataDir); err == nil || !strings.Contains(err.Error(), "regular file") {
			t.Fatalf("record directory must be rejected: %v", err)
		}
	})
	t.Run("unprivate", func(t *testing.T) {
		dataDir := writeRecordFile(t, validRecordBody(), 0o644)
		if _, err := readRecord(dataDir); err == nil || !strings.Contains(err.Error(), "private") {
			t.Fatalf("unprivate record must be rejected: %v", err)
		}
	})
	t.Run("fifo", func(t *testing.T) {
		dataDir := filepath.Join(t.TempDir(), "data")
		if err := os.MkdirAll(dataDir, 0o700); err != nil {
			t.Fatal(err)
		}
		path := filepath.Join(dataDir, recordName)
		if err := syscall.Mkfifo(path, 0o600); err != nil {
			t.Fatal(err)
		}
		done := make(chan error, 1)
		go func() {
			_, err := readRecord(dataDir)
			done <- err
		}()
		select {
		case err := <-done:
			if err == nil || !strings.Contains(err.Error(), "regular file") {
				t.Fatalf("record FIFO must be rejected without blocking: %v", err)
			}
		case <-time.After(5 * time.Second):
			t.Fatal("read-only record open must not block on a FIFO")
		}
	})
}

func writeRecordFilePaths(t *testing.T, body string, perm os.FileMode) (string, string) {
	t.Helper()
	dataDir := filepath.Join(t.TempDir(), "data")
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dataDir, recordName)
	if err := os.WriteFile(path, []byte(body), perm); err != nil {
		t.Fatal(err)
	}
	return dataDir, path
}

func TestReadRecordErrorsNeverEmitRecordMaterial(t *testing.T) {
	body := strings.Replace(validRecordBody(), strings.Repeat(capabilityMarker, 16), strings.Repeat("g", 64), 1)
	dataDir := writeRecordFile(t, body, 0o600)
	_, err := readRecord(dataDir)
	if err == nil {
		t.Fatal("invalid capability must be rejected")
	}
	for _, secret := range []string{instanceMarker, strings.Repeat(digestMarker, 16), strings.Repeat("g", 64)} {
		if strings.Contains(err.Error(), secret) {
			t.Errorf("record errors must never quote record material: %v", err)
		}
	}
}
