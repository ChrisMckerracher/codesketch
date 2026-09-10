package lifecycle

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func stopAckBody(record ownershipRecord, state string) string {
	return `{"instanceId":"` + record.InstanceID + `","state":"` + state + `"}`
}

func TestRequestStopSendsExactBodyAndValidatesAck(t *testing.T) {
	var method, path, contentType, capability, body string
	record := testRecord("", strings.Repeat("a", 64))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method, path = r.Method, r.URL.Path
		contentType = r.Header.Get("Content-Type")
		capability = r.Header.Get(capabilityHeader)
		raw, _ := readAllBounded(r)
		body = raw
		if r.URL.Path != stopEndpoint {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Write([]byte(stopAckBody(record, "stopping")))
	}))
	defer server.Close()
	record.URL = server.URL
	if err := requestStop(t.Context(), record); err != nil {
		t.Fatal(err)
	}
	if method != http.MethodPost || path != stopEndpoint {
		t.Fatalf("stop must POST the frozen path: %s %s", method, path)
	}
	if contentType != "application/json" {
		t.Errorf("stop must send the json content type: %s", contentType)
	}
	if capability != record.Capability {
		t.Errorf("stop must carry the record capability header")
	}
	if body != `{"instanceId":"status-instance"}` {
		t.Errorf("stop body must be exactly the instance identity object: %s", body)
	}
}

// readAllBounded is a small test-only body reader for request assertions.
func readAllBounded(r *http.Request) (string, error) {
	data := make([]byte, 4096)
	read, err := r.Body.Read(data)
	return string(data[:read]), err
}

func TestRequestStopRejectsDeviations(t *testing.T) {
	record := testRecord("", strings.Repeat("a", 64))
	for name, respond := range map[string]func(w http.ResponseWriter, r *http.Request){
		"identitymismatch": func(w http.ResponseWriter, _ *http.Request) {
			other := testRecord("", strings.Repeat("a", 64))
			other.InstanceID = "other-instance"
			w.Write([]byte(stopAckBody(other, "stopping")))
		},
		"wrongstate": func(w http.ResponseWriter, _ *http.Request) {
			w.Write([]byte(stopAckBody(record, "running")))
		},
		"extrakey": func(w http.ResponseWriter, _ *http.Request) {
			w.Write([]byte(stopAckBody(record, "stopping")[:len(stopAckBody(record, "stopping"))-1] + `,"extra":1}`))
		},
		"missingkey": func(w http.ResponseWriter, _ *http.Request) {
			w.Write([]byte(`{"instanceId":"status-instance"}`))
		},
		"casevariant": func(w http.ResponseWriter, _ *http.Request) {
			w.Write([]byte(strings.Replace(stopAckBody(record, "stopping"), `"instanceId"`, `"InstanceId"`, 1)))
		},
		"trailingcontent": func(w http.ResponseWriter, _ *http.Request) {
			w.Write([]byte(stopAckBody(record, "stopping") + " {}"))
		},
		"oversized": func(w http.ResponseWriter, _ *http.Request) {
			w.Write([]byte(strings.Repeat("x", stopAckLimit*2)))
		},
		"conflict": func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusConflict)
		},
		"flushfailure": func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		},
		"forbidden": func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusForbidden)
		},
		"redirect": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Location", "http://127.0.0.1:1/elsewhere")
			w.WriteHeader(http.StatusFound)
		},
	} {
		t.Run(name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(respond))
			defer server.Close()
			probe := record
			probe.URL = server.URL
			if err := requestStop(t.Context(), probe); err == nil {
				t.Fatalf("requestStop must reject %s", name)
			}
		})
	}
}

func TestRequestStopErrorsNeverLeakMaterial(t *testing.T) {
	record := testRecord("", strings.Repeat("a", 64))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"recovery flush failed with capability ` + record.Capability + `"}`))
	}))
	defer server.Close()
	probe := record
	probe.URL = server.URL
	err := requestStop(t.Context(), probe)
	if err == nil {
		t.Fatal("a failed flush stop must error")
	}
	if strings.Contains(err.Error(), "recovery flush") || strings.Contains(err.Error(), record.Capability) {
		t.Errorf("stop errors must never quote raw response or capability material: %v", err)
	}
	if !strings.Contains(err.Error(), "500") {
		t.Errorf("stop errors must carry the bounded status code: %v", err)
	}
}
