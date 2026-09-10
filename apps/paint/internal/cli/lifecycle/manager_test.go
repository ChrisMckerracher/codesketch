package lifecycle

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultOptionsUsesContractDefaults(t *testing.T) {
	options, err := DefaultOptions()
	if err != nil {
		t.Skipf("user directories unavailable: %v", err)
	}
	if options.Node != "node" {
		t.Errorf("default node executable must be node: %s", options.Node)
	}
	if options.Port != 4317 {
		t.Errorf("default port must be the production port: %d", options.Port)
	}
	if filepath.Base(options.DataDir) != "codesketch" || filepath.Base(options.CacheDir) != "codesketch" {
		t.Errorf("defaults must end in codesketch: %s %s", options.DataDir, options.CacheDir)
	}
	if options.NoOpen {
		t.Error("default options must allow opening the browser")
	}
}

func TestNewValidatesOptionsWithoutFilesystemIO(t *testing.T) {
	base := t.TempDir()
	data := filepath.Join(base, "data")
	cache := filepath.Join(base, "cache")
	node := "node"
	for _, opts := range []Options{
		{CacheDir: cache, Node: node},
		{DataDir: data, Node: node},
		{DataDir: data, CacheDir: cache},
		{DataDir: data, CacheDir: cache, Node: node, Port: 431},
		{DataDir: data, CacheDir: cache, Node: node, Port: 1023},
		{DataDir: data, CacheDir: cache, Node: node, Port: 65536},
	} {
		if _, err := New(opts); err == nil {
			t.Errorf("New must reject invalid options: %+v", opts)
		}
	}
	for _, port := range []int{0, 1024, 4317, 65535} {
		if _, err := New(Options{DataDir: data, CacheDir: cache, Node: node, Port: port}); err != nil {
			t.Fatalf("New must accept port %d: %v", port, err)
		}
	}
}

func TestNewNormalizesPathsAndStoresEmbeddedDigest(t *testing.T) {
	base := t.TempDir()
	manager, err := New(Options{DataDir: filepath.Join("relative", "data"), CacheDir: "cache", Node: "node", Port: 0, NoOpen: true})
	if err != nil {
		t.Fatal(err)
	}
	if !filepath.IsAbs(manager.dataDir) || !filepath.IsAbs(manager.cacheDir) {
		t.Errorf("New must normalize directories to absolute paths: %s %s", manager.dataDir, manager.cacheDir)
	}
	if manager.port != 0 {
		t.Errorf("New must preserve port 0: %d", manager.port)
	}
	if !manager.noOpen {
		t.Error("New must preserve NoOpen")
	}
	_, digest, err := runtimeManifest()
	if err != nil {
		t.Fatal(err)
	}
	if manager.digest != digest {
		t.Errorf("New must store the current embedded runtime digest: %s", manager.digest)
	}
	if _, err := os.Stat(filepath.Join(base, "cache")); !os.IsNotExist(err) {
		t.Errorf("New must not touch the cache directory: %v", err)
	}
}
