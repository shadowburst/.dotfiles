package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/BurntSushi/toml"
)

// agentKinds is the list in the popup. A kind must be a Herdr `--kind` value.
var agentKinds = []string{"claude", "codex", "pi", "opencode"}

// defaultNamingCommand is the flake's text generation wrapper.
var defaultNamingCommand = []string{"textgen"}

type agentConfig struct {
	Models  []string `toml:"models"`
	Efforts []string `toml:"efforts"`
}

// Config is $HERDR_PLUGIN_CONFIG_DIR/config.toml.
type Config struct {
	NamingCommand []string               `toml:"naming_command"`
	Agents        map[string]agentConfig `toml:"agents"`
}

func loadConfig() Config {
	var cfg Config
	path := filepath.Join(os.Getenv("HERDR_PLUGIN_CONFIG_DIR"), "config.toml")
	if _, err := toml.DecodeFile(path, &cfg); err != nil && !errors.Is(err, os.ErrNotExist) {
		fmt.Fprintf(os.Stderr, "herdr-worktree: %s: %v\n", path, err)
	}
	if len(cfg.NamingCommand) == 0 {
		cfg.NamingCommand = defaultNamingCommand
	}
	return cfg
}

// agentHasModel is false for kinds without a flag that selects a model. These
// kinds use their own default, and the popup hides the model and effort fields.
func agentHasModel(kind string) bool { return kind != "opencode" }

// agentArgs builds the native flags of one agent. An empty value gives no flag.
func agentArgs(kind, model, effort string) []string {
	var modelFlag, effortFlag string
	switch kind {
	case "claude":
		modelFlag, effortFlag = "--model", "--effort"
	case "pi":
		modelFlag, effortFlag = "--model", "--thinking"
	case "codex":
		modelFlag, effortFlag = "-m", "-c"
		if effort != "" {
			effort = "model_reasoning_effort=" + effort
		}
	default:
		return nil
	}
	var args []string
	if model != "" {
		args = append(args, modelFlag, model)
	}
	if effort != "" {
		args = append(args, effortFlag, effort)
	}
	return args
}

// Selection is what the user selected in the popup.
type Selection struct {
	Agent  string `json:"agent"`
	Model  string `json:"model"`
	Effort string `json:"effort"`
}

// prefs is the cache of the last selections.
type prefs struct {
	Agent string `json:"agent"`
	// Agents holds the last model and effort per agent.
	Agents map[string]Selection `json:"agents"`
}

// Draft is a prompt that did not start. Repo tells if Base still applies.
type Draft struct {
	Selection
	Prompt string `json:"prompt"`
	Branch string `json:"branch,omitempty"`
	Base   string `json:"base,omitempty"`
	Repo   string `json:"repo,omitempty"`
}

func statePath(name string) string {
	return filepath.Join(os.Getenv("HERDR_PLUGIN_STATE_DIR"), name)
}

func readJSON(path string, out any) bool {
	raw, err := os.ReadFile(path)
	return err == nil && json.Unmarshal(raw, out) == nil
}

func writeJSON(path string, value any) error {
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func loadPrefs() prefs {
	p := prefs{Agents: map[string]Selection{}}
	readJSON(statePath("prefs.json"), &p)
	if p.Agents == nil {
		p.Agents = map[string]Selection{}
	}
	return p
}

func savePrefs(s Selection) error {
	p := loadPrefs()
	p.Agent = s.Agent
	p.Agents[s.Agent] = s
	return writeJSON(statePath("prefs.json"), p)
}

func loadDraft() (Draft, bool) {
	var d Draft
	ok := readJSON(statePath("draft.json"), &d)
	return d, ok && d.Prompt != ""
}

// saveDraft replaces the draft. The popup uses it: the user saw the old draft.
func saveDraft(d Draft) error { return writeJSON(statePath("draft.json"), d) }

// keepDraft is for a failed job, which the user does not see. It never loses a
// prompt: a different draft moves to draft-<time>.json.
func keepDraft(d Draft) error {
	if old, ok := loadDraft(); ok && old.Prompt != d.Prompt {
		name := fmt.Sprintf("draft-%d.json", time.Now().UnixNano())
		if err := os.Rename(statePath("draft.json"), statePath(name)); err != nil {
			return err
		}
	}
	return saveDraft(d)
}

func clearDraft() { _ = os.Remove(statePath("draft.json")) }
