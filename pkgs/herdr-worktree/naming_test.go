package main

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestSlugify(t *testing.T) {
	tests := map[string]string{
		"Fix the login bug":              "fix-the-login-bug",
		"Corriger l'été à Noël — vite !": "corriger-l-ete-a-noel-vite",
		"  many   spaces\nand lines ":    "many-spaces-and-lines",
		"日本語":                            "",
	}
	for in, want := range tests {
		if got := slugify(in, 0, maxSlugLength); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
	if got := slugify("one two three four", 2, 48); got != "one-two" {
		t.Errorf("word limit: %q", got)
	}
	long := strings.Repeat("word ", 30)
	if got := slugify(long, 0, 48); len(got) > 48 || strings.HasSuffix(got, "-") {
		t.Errorf("length limit: %q", got)
	}
}

func TestSanitizeBranch(t *testing.T) {
	tests := []struct {
		in, want string
		ok       bool
	}{
		{"feat/add-dark-mode\n", "feat/add-dark-mode", true},
		{"`fix/Login_Bug`", "fix/login-bug", true},
		{"Here is the name:\n\n**chore/update-deps**\n", "chore/update-deps", true},
		{"feature/foo", "", false},
		{"I cannot do that.", "", false},
		{"", "", false},
		{"feat/!!!", "", false},
		{"feat/" + strings.Repeat("abc-", 40), strings.TrimRight("feat/"+strings.Repeat("abc-", 12), "-"), true},
	}
	for _, tt := range tests {
		got, ok := sanitizeBranch(tt.in)
		if got != tt.want || ok != tt.ok {
			t.Errorf("sanitizeBranch(%q) = %q, %v; want %q, %v", tt.in, got, ok, tt.want, tt.ok)
		}
	}
}

func TestFallbackBranch(t *testing.T) {
	now := time.Unix(1700000000, 0)
	if got := fallbackBranch("Add a dark mode toggle to the settings page", now); got != "feat/add-a-dark-mode-toggle-to" {
		t.Errorf("got %q", got)
	}
	if got := fallbackBranch("日本語", now); got != "feat/task-1700000000" {
		t.Errorf("got %q", got)
	}
}

func TestBranchSlug(t *testing.T) {
	if got := branchSlug("feat/x-y"); got != "x-y" {
		t.Errorf("got %q", got)
	}
	if got := branchSlug("plain"); got != "plain" {
		t.Errorf("got %q", got)
	}
}

func TestUniqueName(t *testing.T) {
	taken := map[string]bool{"a": true, "a-2": true}
	if got := uniqueName("a", func(s string) bool { return taken[s] }); got != "a-3" {
		t.Errorf("got %q", got)
	}
	if got := uniqueName("b", func(s string) bool { return taken[s] }); got != "b" {
		t.Errorf("got %q", got)
	}
}

func TestAgentName(t *testing.T) {
	none := func(string) bool { return false }
	long := strings.Repeat("abcdefgh-", 6)
	tests := map[string]string{
		"add-dark-mode": "add-dark-mode",
		"2fa-login":     "agent-2fa-login",
		"--x":           "x",
		"":              "agent",
		"UP_per":        "up_per",
	}
	for in, want := range tests {
		if got := agentName(in, none); got != want {
			t.Errorf("agentName(%q) = %q, want %q", in, got, want)
		}
	}
	if got := agentName(long, none); len(got) > 32 || strings.HasSuffix(got, "-") {
		t.Errorf("long name: %q", got)
	}
	first := agentName(long, none)
	got := agentName(long, func(s string) bool { return s == first })
	if len(got) > 32 || !strings.HasSuffix(got, "-2") {
		t.Errorf("unique long name: %q", got)
	}
}

func TestAgentArgs(t *testing.T) {
	tests := []struct {
		kind, model, effort string
		want                []string
	}{
		{"claude", "opus", "high", []string{"--model", "opus", "--effort", "high"}},
		{"codex", "gpt", "low", []string{"-m", "gpt", "-c", "model_reasoning_effort=low"}},
		{"opencode", "x", "y", nil},
		{"claude", "", "", nil},
		{"codex", "", "low", []string{"-c", "model_reasoning_effort=low"}},
	}
	for _, tt := range tests {
		if got := agentArgs(tt.kind, tt.model, tt.effort); !reflect.DeepEqual(got, tt.want) {
			t.Errorf("agentArgs(%q,%q,%q) = %v, want %v", tt.kind, tt.model, tt.effort, got, tt.want)
		}
	}
}
