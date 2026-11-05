package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"time"
)

const defaultTimeout = 20 * time.Second

// herdrError is a server error from the Herdr CLI (JSON on stderr, exit 1).
type herdrError struct {
	Code    string
	Message string
}

func (e *herdrError) Error() string {
	if e.Code == "" {
		return e.Message
	}
	return e.Code + ": " + e.Message
}

func herdrBin() string {
	if bin := os.Getenv("HERDR_BIN_PATH"); bin != "" {
		return bin
	}
	return "herdr"
}

// runCommand runs a command in its own process group, so that a timeout also
// stops the children of the command. It returns stdout and stderr.
func runCommand(timeout time.Duration, dir, stdin, name string, args ...string) (string, string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error { return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL) }
	cmd.WaitDelay = time.Second
	if stdin != "" {
		cmd.Stdin = strings.NewReader(stdin)
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	if ctx.Err() != nil {
		err = fmt.Errorf("timeout after %s", timeout)
	}
	return stdout.String(), stderr.String(), err
}

// output returns stdout when the command succeeds.
func output(timeout time.Duration, dir, name string, args ...string) (string, bool) {
	stdout, _, err := runCommand(timeout, dir, "", name, args...)
	return stdout, err == nil
}

// herdrCall runs the Herdr CLI and decodes `.result` into result, when result
// is not nil. A failure is a *herdrError when Herdr gives a structured error.
func herdrCall(timeout time.Duration, result any, args ...string) (string, error) {
	stdout, stderr, err := runCommand(timeout, "", "", herdrBin(), args...)
	if err != nil {
		var body struct {
			Error herdrError `json:"error"`
		}
		if json.Unmarshal([]byte(stderr), &body) == nil && body.Error.Code != "" {
			return stdout, &body.Error
		}
		if msg := strings.TrimSpace(stderr); msg != "" {
			return stdout, fmt.Errorf("%s: %w", msg, err)
		}
		return stdout, err
	}
	if result != nil {
		var body struct {
			Result json.RawMessage `json:"result"`
		}
		if err := json.Unmarshal([]byte(stdout), &body); err != nil {
			return stdout, fmt.Errorf("decode herdr %s: %w", args[0], err)
		}
		if err := json.Unmarshal(body.Result, result); err != nil {
			return stdout, fmt.Errorf("decode herdr %s: %w", args[0], err)
		}
	}
	return stdout, nil
}
