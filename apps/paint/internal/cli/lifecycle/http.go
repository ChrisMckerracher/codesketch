package lifecycle

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"syscall"
	"time"
)

const (
	// statusEndpoint is the frozen lifecycle status path.
	statusEndpoint = "/api/lifecycle/status"
	// statusDeadline bounds one authenticated status request.
	statusDeadline = 2 * time.Second
	// statusLimit bounds the status response body.
	statusLimit = 16 * 1024
	// capabilityHeader authenticates lifecycle requests without ever
	// appearing in URLs or errors.
	capabilityHeader = "X-Codesketch-Capability"
)

var (
	// errStatusUnready reports the 503 pre-publication window.
	errStatusUnready = errors.New("lifecycle status endpoint is not ready")
	// errStatusMismatch reports a verified response that disagrees with the
	// ownership record.
	errStatusMismatch = errors.New("lifecycle status identity does not match the ownership record")
)

// statusResponse is the exact status body shape.
type statusResponse struct {
	InstanceID string `json:"instanceId"`
	PID        int    `json:"pid"`
	URL        string `json:"url"`
	Digest     string `json:"digest"`
	State      string `json:"state"`
}

// result converts a verified status response into a public Result.
func (response statusResponse) result() Result {
	state := Running
	if response.State == string(Stopping) {
		state = Stopping
	}
	return Result{URL: response.URL, InstanceID: response.InstanceID, Digest: response.Digest, PID: response.PID, State: state}
}

// fetchStatus performs one authenticated status request against the record's
// literal loopback URL: proxies and redirects are disabled, the actual dial
// target must be the literal loopback address with an explicit port, the
// response body is bounded and must carry the exact case-sensitive keys, and
// the full identity must agree with the ownership record. Errors never
// contain capability material.
func fetchStatus(ctx context.Context, record ownershipRecord) (statusResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, statusDeadline)
	defer cancel()
	if !validRecordURL(record.URL) {
		return statusResponse{}, errors.New("lifecycle status requires the strict literal loopback record url")
	}
	client := newDirectClient(statusDeadline)
	defer client.CloseIdleConnections()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, record.URL+statusEndpoint, nil)
	if err != nil {
		return statusResponse{}, fmt.Errorf("lifecycle status request is invalid: %w", err)
	}
	request.Header.Set(capabilityHeader, record.Capability)
	request.Header.Set("Accept", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return statusResponse{}, err
	}
	defer response.Body.Close()
	switch {
	case response.StatusCode == http.StatusServiceUnavailable:
		return statusResponse{}, errStatusUnready
	case response.StatusCode != http.StatusOK:
		return statusResponse{}, fmt.Errorf("lifecycle status endpoint returned code %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, statusLimit+1))
	if err != nil {
		return statusResponse{}, err
	}
	if int64(len(body)) > statusLimit {
		return statusResponse{}, fmt.Errorf("lifecycle status response exceeds the %d byte limit", statusLimit)
	}
	return parseStatus(record, body)
}

// parseStatus requires the exact frozen case-sensitive body keys and full
// identity agreement with the ownership record.
func parseStatus(record ownershipRecord, body []byte) (statusResponse, error) {
	response, err := parseStatusBody(body)
	if err != nil {
		return statusResponse{}, err
	}
	if response.InstanceID != record.InstanceID || response.PID != record.PID ||
		response.URL != record.URL || response.Digest != record.Digest {
		return statusResponse{}, errStatusMismatch
	}
	return response, nil
}

// loopbackControl restricts dials to the literal loopback address with an
// explicit port.
func loopbackControl(network, address string, _ syscall.RawConn) error {
	host, port, err := net.SplitHostPort(address)
	if err != nil || network != "tcp" && network != "tcp4" {
		return fmt.Errorf("lifecycle requests dial loopback tcp only: %s %s", network, address)
	}
	if host != "127.0.0.1" {
		return fmt.Errorf("lifecycle requests dial the literal loopback address only: %s", host)
	}
	if !validRecordURL("http://127.0.0.1:" + port) {
		return fmt.Errorf("lifecycle requests dial explicit loopback ports only: %s", port)
	}
	return nil
}

// newDirectClient builds a client with proxies and redirects disabled and
// dials constrained to the literal loopback endpoint.
func newDirectClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			Proxy:       nil,
			DialContext: (&net.Dialer{Timeout: timeout, Control: loopbackControl}).DialContext,
		},
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return errors.New("lifecycle redirects are forbidden")
		},
	}
}

// parseStatusBody validates the exact frozen case-sensitive body keys and
// legal state without comparing identity. The readiness frame reuses it.
func parseStatusBody(body []byte) (statusResponse, error) {
	var keys map[string]json.RawMessage
	decoder := json.NewDecoder(bytes.NewReader(body))
	if err := decoder.Decode(&keys); err != nil {
		return statusResponse{}, fmt.Errorf("lifecycle status body must decode to the exact schema")
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return statusResponse{}, fmt.Errorf("lifecycle status body must be exactly one JSON object")
	}
	expected := []string{"instanceId", "pid", "url", "digest", "state"}
	if len(keys) != len(expected) {
		return statusResponse{}, fmt.Errorf("lifecycle status body must contain exactly the frozen keys")
	}
	for _, key := range expected {
		if _, ok := keys[key]; !ok {
			return statusResponse{}, fmt.Errorf("lifecycle status body key %s is missing or misspelled", key)
		}
	}
	var response statusResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return statusResponse{}, fmt.Errorf("lifecycle status body must decode to the exact schema")
	}
	if response.State != string(Running) && response.State != string(Stopping) {
		return statusResponse{}, fmt.Errorf("lifecycle status state must be running or stopping")
	}
	return response, nil
}
