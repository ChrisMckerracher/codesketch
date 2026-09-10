// Package transport owns bounded HTTP requests to the local studio.
package transport

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	DefaultURL       = "http://127.0.0.1:4317"
	MaxRequestBytes  = 8 << 20
	MaxResponseBytes = 16 << 20
	RequestTimeout   = 10 * time.Second
)

type Client struct {
	base *url.URL
	http *http.Client
}

type Error struct{ Code, Message string }

func (e *Error) Error() string { return e.Message }

// Endpoint rejects authority confusion and non-loopback destinations before I/O.
func Endpoint(raw string) (*url.URL, error) {
	if raw == "" {
		raw = DefaultURL
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("invalid PAINT_URL: %w", err)
	}
	if (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.Opaque != "" ||
		u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return nil, fmt.Errorf("PAINT_URL requires an http(s) loopback origin without credentials, path, query, or fragment")
	}
	host := u.Hostname()
	ip := net.ParseIP(host)
	if host != "localhost" && (ip == nil || !ip.IsLoopback()) {
		return nil, fmt.Errorf("PAINT_URL must target a loopback address")
	}
	if strings.HasSuffix(u.Host, ":") {
		return nil, fmt.Errorf("PAINT_URL has an empty port")
	}
	if port := u.Port(); port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			return nil, fmt.Errorf("PAINT_URL port must be 1..65535")
		}
	}
	u.Path = ""
	return u, nil
}

func New(raw string) (*Client, error) {
	u, err := Endpoint(raw)
	if err != nil {
		return nil, err
	}
	t := &http.Transport{
		Proxy: nil, DialContext: loopbackDial,
		TLSHandshakeTimeout: 5 * time.Second, ResponseHeaderTimeout: RequestTimeout,
		IdleConnTimeout: 30 * time.Second, MaxResponseHeaderBytes: 64 << 10,
		DisableCompression: true,
	}
	return &Client{base: u, http: &http.Client{
		Transport: t, Timeout: RequestTimeout,
		CheckRedirect: func(*http.Request, []*http.Request) error { return fmt.Errorf("redirects are disabled") },
	}}, nil
}

// Resolve first, check every resolved IP, then dial a literal checked address.
// DNS cannot change the destination between validation and the actual dial.
func loopbackDial(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("loopback host has no addresses")
	}
	for _, ip := range ips {
		if !ip.IP.IsLoopback() || ip.Zone != "" {
			return nil, fmt.Errorf("resolved destination is not loopback")
		}
	}
	d := net.Dialer{Timeout: 5 * time.Second}
	for _, ip := range ips {
		var conn net.Conn
		conn, err = d.DialContext(ctx, network, net.JoinHostPort(ip.IP.String(), port))
		if err == nil {
			return conn, nil
		}
	}
	return nil, err
}

func (c *Client) Close()      { c.http.CloseIdleConnections() }
func (c *Client) URL() string { return c.base.String() }

func (c *Client) Request(ctx context.Context, method, path string, body any) (json.RawMessage, error) {
	var data []byte
	var err error
	if body != nil {
		data, err = json.Marshal(body)
		if err != nil {
			return nil, err
		}
		if len(data) > MaxRequestBytes {
			return nil, fmt.Errorf("request exceeds %d bytes", MaxRequestBytes)
		}
	}
	rel, err := url.Parse(path)
	if err != nil || rel.IsAbs() || rel.Host != "" || !strings.HasPrefix(path, "/api/") || rel.Fragment != "" {
		return nil, fmt.Errorf("invalid API path")
	}
	u := c.base.ResolveReference(rel)
	ctx, cancel := context.WithTimeout(ctx, RequestTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, method, u.String(), bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("studio request failed: %w", err)
	}
	defer res.Body.Close()
	if res.ContentLength > MaxResponseBytes {
		return nil, fmt.Errorf("response exceeds %d bytes", MaxResponseBytes)
	}
	data, err = io.ReadAll(io.LimitReader(res.Body, MaxResponseBytes+1))
	if err != nil {
		return nil, fmt.Errorf("reading studio response: %w", err)
	}
	if len(data) > MaxResponseBytes {
		return nil, fmt.Errorf("response exceeds %d bytes", MaxResponseBytes)
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		var detail struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(data, &detail)
		code := "HTTP_ERROR"
		if detail.Error != "" {
			code = "API_ERROR"
		} else {
			detail.Error = string(data[:min(len(data), 300)])
		}
		return nil, &Error{code, fmt.Sprintf("%s: %s", res.Status, detail.Error)}
	}
	if !json.Valid(data) {
		return nil, fmt.Errorf("studio response is not valid JSON")
	}
	return json.RawMessage(data), nil
}
