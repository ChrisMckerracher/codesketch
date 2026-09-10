package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	exit := (cli.Runner{}).Run(ctx, os.Args[1:])
	cancel()
	os.Exit(exit)
}
