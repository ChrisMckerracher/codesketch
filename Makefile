.PHONY: build install policy-go vet-go test-go verify-go

PREFIX ?= $(HOME)/.local
GO_ENV = GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOWORK=off GOFLAGS= GOENV=off

build: policy-go
	@mkdir -p bin
	$(GO_ENV) CGO_ENABLED=0 go build -trimpath -o bin/paint ./cmd/paint

install: build
	install -d "$(PREFIX)/bin"
	install -m 0755 bin/paint "$(PREFIX)/bin/paint"

policy-go:
	$(GO_ENV) node tools/verify-go.mjs --policy-only

vet-go: policy-go
	$(GO_ENV) CGO_ENABLED=0 go vet ./...

test-go: policy-go
	$(GO_ENV) CGO_ENABLED=1 go test -race ./...

verify-go: vet-go test-go
