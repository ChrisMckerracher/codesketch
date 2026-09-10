package lifecycle

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func testRecord(url, digest string) ownershipRecord {
	return ownershipRecord{
		InstanceID: "status-instance",
		PID:        4242,
		URL:        url,
		Digest:     digest,
		Capability: strings.Repeat("c", 64),
	}
}

func statusBody(record ownershipRecord, state string) string {
	return `{"instanceId":"` + record.InstanceID + `","pid":` + itoa(record.PID) +
		`,"url":"` + record.URL + `","digest":"` + record.Digest + `","state":"` + state + `"}`
}

func itoa(value int) string {
	digits := []byte{}
	if value == 0 {
		return "0"
	}
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	return string(digits)
}

func TestFetchStatusAuthenticatesAndMatchesRecordedIdentity(t *testing.T) {
	var guard sync.Mutex
	var gotCapability, gotHost, gotOrigin, gotFetchMode string
	record := testRecord("", "aaaaaaaa")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		guard.Lock()
		defer guard.Unlock()
		gotCapability = r.Header.Get(capabilityHeader)
		gotHost = r.Host
		gotOrigin = r.Header.Get("Origin")
		gotFetchMode = r.Header.Get("Sec-Fetch-Mode")
		if r.URL.Path != statusEndpoint {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Write([]byte(statusBody(record, "running")))
	}))
	defer server.Close()
	record.URL = server.URL
	response, err := fetchStatus(t.Context(), record)
	if err != nil {
		t.Fatal(err)
	}
	guard.Lock()
	defer guard.Unlock()
	if gotCapability != record.Capability {
		t.Error("status requests must carry the record capability header")
	}
	if gotHost != strings.TrimPrefix(server.URL, "http://") {
		t.Errorf("status requests must send the exact loopback host: %s", gotHost)
	}
	if gotOrigin != "" || gotFetchMode != "" {
		t.Errorf("status requests must not send browser headers: %q %q", gotOrigin, gotFetchMode)
	}
	if response.State != "running" || response.PID != record.PID {
		t.Errorf("verified response must round-trip: %+v", response)
	}
	if response.result().State != Running {
		t.Errorf("a running status must map to the running state: %+v", response.result())
	}
}

func TestFetchStatusRejectsDeviations(t *testing.T) {
	for name, handler := range map[string]func(http.ResponseWriter, *http.Request){
		"unready": func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusServiceUnavailable)
		},
		"forbidden": func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusForbidden)
		},
		"redirect": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Location", "http://127.0.0.1:1/elsewhere")
			w.WriteHeader(http.StatusFound)
		},
		"identitymismatch": func(w http.ResponseWriter, _ *http.Request) {
			record := testRecord("", strings.Repeat("a", 64))
			record.InstanceID = "other-instance"
			w.Write([]byte(statusBody(record, "running")))
		},
		"digestmismatch": func(w http.ResponseWriter, _ *http.Request) {
			record := testRecord("", strings.Repeat("e", 64))
			w.Write([]byte(statusBody(record, "running")))
		},
		"invalidstate": func(w http.ResponseWriter, _ *http.Request) {
			record := testRecord("", strings.Repeat("a", 64))
			w.Write([]byte(statusBody(record, "stopped")))
		},
		"extrakey": func(w http.ResponseWriter, _ *http.Request) {
			record := testRecord("", strings.Repeat("a", 64))
			w.Write([]byte(statusBody(record, "running")[:len(statusBody(record, "running"))-1] + `,"extra":1}`))
		},
		"missingkey": func(w http.ResponseWriter, _ *http.Request) {
			record := testRecord("", strings.Repeat("a", 64))
			body := statusBody(record, "running")
			w.Write([]byte(strings.Replace(body, `"digest":"`+strings.Repeat("a", 64)+`",`, ``, 1)))
		},
		"casevariant": func(w http.ResponseWriter, _ *http.Request) {
			record := testRecord("", strings.Repeat("a", 64))
			w.Write([]byte(strings.Replace(statusBody(record, "running"), `"instanceId"`, `"InstanceId"`, 1)))
		},
		"trailingcontent": func(w http.ResponseWriter, _ *http.Request) {
			record := testRecord("", strings.Repeat("a", 64))
			w.Write([]byte(statusBody(record, "running") + " {}"))
		},
		"oversized": func(w http.ResponseWriter, _ *http.Request) {
			w.Write([]byte(strings.Repeat("x", statusLimit*2)))
		},
	} {
		t.Run(name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(handler))
			defer server.Close()
			record := testRecord(server.URL, strings.Repeat("a", 64))
			if _, err := fetchStatus(t.Context(), record); err == nil {
				t.Fatalf("fetchStatus must reject %s", name)
			}
		})
	}
}

func TestFetchStatusTreatsUnreadySeparatelyFromMismatch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()
	record := testRecord(server.URL, strings.Repeat("a", 64))
	if _, err := fetchStatus(t.Context(), record); !errors.Is(err, errStatusUnready) {
		t.Fatalf("503 must classify as unready: %v", err)
	}
}
