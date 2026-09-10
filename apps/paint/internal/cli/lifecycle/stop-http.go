package lifecycle

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	// stopEndpoint is the frozen authenticated stop path.
	stopEndpoint = "/api/lifecycle/stop"
	// stopDeadline bounds one authenticated stop request, leaving enough
	// room for the server's durable flush before its acknowledgement.
	stopDeadline = 15 * time.Second
	// stopAckLimit bounds the stop acknowledgement body.
	stopAckLimit = 1024
)

// stopRequestBody is the exact frozen stop request object.
type stopRequestBody struct {
	InstanceID string `json:"instanceId"`
}

// stopAck is the exact stop acknowledgement shape.
type stopAck struct {
	InstanceID string `json:"instanceId"`
	State      string `json:"state"`
}

// requestStop sends one authenticated stop request against the record's
// literal loopback URL and validates the bounded exact acknowledgement
// {instanceId,state:"stopping"}. Proxies and redirects are disabled, the
// dial is constrained to the literal loopback address, idle connections are
// closed, and errors never quote capability or raw response material.
func requestStop(ctx context.Context, record ownershipRecord) error {
	ctx, cancel := context.WithTimeout(ctx, stopDeadline)
	defer cancel()
	if !validRecordURL(record.URL) {
		return errors.New("lifecycle stop requires the strict literal loopback record url")
	}
	body, err := json.Marshal(stopRequestBody{InstanceID: record.InstanceID})
	if err != nil {
		return err
	}
	client := newDirectClient(stopDeadline)
	defer client.CloseIdleConnections()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, record.URL+stopEndpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("lifecycle stop request is invalid: %w", err)
	}
	request.Header.Set(capabilityHeader, record.Capability)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("lifecycle stop request failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("lifecycle stop endpoint returned code %d", response.StatusCode)
	}
	ackBody, err := io.ReadAll(io.LimitReader(response.Body, stopAckLimit+1))
	if err != nil {
		return fmt.Errorf("lifecycle stop acknowledgement failed: %w", err)
	}
	if int64(len(ackBody)) > stopAckLimit {
		return fmt.Errorf("lifecycle stop acknowledgement exceeds the %d byte limit", stopAckLimit)
	}
	_, err = parseStopAck(record, ackBody)
	return err
}

// parseStopAck requires the exact frozen acknowledgement keys, the stopped
// record's identity and the stopping state.
func parseStopAck(record ownershipRecord, body []byte) (stopAck, error) {
	var keys map[string]json.RawMessage
	decoder := json.NewDecoder(bytes.NewReader(body))
	if err := decoder.Decode(&keys); err != nil {
		return stopAck{}, fmt.Errorf("lifecycle stop acknowledgement must decode to the exact schema")
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return stopAck{}, fmt.Errorf("lifecycle stop acknowledgement must be exactly one JSON object")
	}
	expected := []string{"instanceId", "state"}
	if len(keys) != len(expected) {
		return stopAck{}, fmt.Errorf("lifecycle stop acknowledgement must contain exactly the frozen keys")
	}
	for _, key := range expected {
		if _, ok := keys[key]; !ok {
			return stopAck{}, fmt.Errorf("lifecycle stop acknowledgement key %s is missing or misspelled", key)
		}
	}
	var ack stopAck
	if err := json.Unmarshal(body, &ack); err != nil {
		return stopAck{}, fmt.Errorf("lifecycle stop acknowledgement must decode to the exact schema")
	}
	if ack.InstanceID != record.InstanceID {
		return stopAck{}, errors.New("lifecycle stop acknowledgement identity does not match the ownership record")
	}
	if ack.State != string(Stopping) {
		return stopAck{}, errors.New("lifecycle stop acknowledgement state is not stopping")
	}
	return ack, nil
}
