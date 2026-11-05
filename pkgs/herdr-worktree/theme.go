package main

import (
	"image/color"
	"os"
	"path/filepath"
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/BurntSushi/toml"
)

// palette holds the Herdr theme tokens that the popup uses. An empty value is
// the terminal's own color, and a number is an ANSI color.
type palette struct {
	Accent, PanelBg, Surface0, Surface1, Overlay0, Text, Red string
}

// Herdr compiles its themes into the binary and has no API for them, so these
// values are copied from src/app/state.rs of Herdr v0.9.5.
var palettes = map[string]palette{
	"catppuccin":       {"#89b4fa", "#181825", "#313244", "#45475a", "#6c7086", "#cdd6f4", "#f38ba8"},
	"catppuccin-latte": {"#1e66f5", "#eff1f5", "#ccd0da", "#bcc0cc", "#9ca0b0", "#4c4f69", "#d20f39"},
	"terminal":         {"4", "", "", "8", "7", "", "9"},
	"tokyo-night":      {"#7aa2f7", "#1a1b26", "#24283b", "#414868", "#565f89", "#c0caf5", "#f7768e"},
	"tokyo-night-day":  {"#2e7de9", "#e1e2e7", "#c4c8da", "#a8aecb", "#8990b3", "#3760bf", "#f52a65"},
	"dracula":          {"#bd93f9", "#282a36", "#44475a", "#6272a4", "#6272a4", "#f8f8f2", "#ff5555"},
	"nord":             {"#88c0d0", "#2e3440", "#3b4252", "#434c5e", "#4c566a", "#eceff4", "#bf616a"},
	"gruvbox":          {"#d79921", "#282828", "#3c3836", "#504945", "#928374", "#ebdbb2", "#fb4934"},
	"gruvbox-light":    {"#076678", "#fbf1c7", "#ebdbb2", "#d5c4a1", "#928374", "#3c3836", "#9d0006"},
	"one-dark":         {"#61afef", "#282c34", "#2c313a", "#3e4451", "#5c6370", "#abb2bf", "#e06c75"},
	"one-light":        {"#4078f2", "#fafafa", "#f0f0f1", "#e5e5e6", "#a0a1a7", "#383a42", "#e45649"},
	"solarized":        {"#268bd2", "#002b36", "#073642", "#586e75", "#586e75", "#93a1a1", "#dc322f"},
	"solarized-light":  {"#268bd2", "#fdf6e3", "#eee8d5", "#93a1a1", "#93a1a1", "#657b83", "#dc322f"},
	"kanagawa":         {"#7e9cd8", "#1f1f28", "#2a2a37", "#363646", "#727169", "#dcd7ba", "#c34043"},
	"kanagawa-lotus":   {"#4d699b", "#f2ecbc", "#dcd5ac", "#c9cbd1", "#a09cac", "#545464", "#c84053"},
	"rose-pine":        {"#c4a7e7", "#191724", "#1f1d2e", "#26233a", "#6e6a86", "#e0def4", "#eb6f92"},
	"rose-pine-dawn":   {"#907aa9", "#faf4ed", "#f2e9e1", "#fffaf3", "#9893a5", "#464261", "#b4637a"},
	"vesper":           {"#ffc799", "#1a1a1a", "#232323", "#282828", "#5c5c5c", "#ffffff", "#ff8080"},
}

// themeAliases are the other names that Herdr accepts for its themes.
var themeAliases = map[string]string{
	"catppuccin-mocha": "catppuccin", "latte": "catppuccin-latte", "light": "catppuccin-latte",
	"tokyonight": "tokyo-night", "tokyo-day": "tokyo-night-day", "tokyonight-day": "tokyo-night-day",
	"gruvbox-dark": "gruvbox", "onedark": "one-dark", "onelight": "one-light",
	"solarized-dark": "solarized", "lotus": "kanagawa-lotus", "rosepine": "rose-pine",
	"rosepine-dawn": "rose-pine-dawn", "dawn": "rose-pine-dawn",
}

const defaultTheme = "catppuccin"

func herdrConfigPath() string {
	if path := os.Getenv("HERDR_CONFIG_PATH"); path != "" {
		return path
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(dir, "herdr", "config.toml")
}

// loadPalette resolves the theme from the Herdr config, as Herdr does: a built-in
// by name, with [theme.custom] on top.
//
// shortcut: with theme.auto_switch this always uses dark_name, because the plugin
// cannot see the host's appearance. Only hex values in [theme.custom] apply.
func loadPalette() palette {
	var cfg struct {
		Theme struct {
			Name       string `toml:"name"`
			AutoSwitch bool   `toml:"auto_switch"`
			DarkName   string `toml:"dark_name"`
			Custom     struct {
				Accent   string `toml:"accent"`
				PanelBg  string `toml:"panel_bg"`
				Surface0 string `toml:"surface0"`
				Surface1 string `toml:"surface1"`
				Overlay0 string `toml:"overlay0"`
				Text     string `toml:"text"`
				Red      string `toml:"red"`
			} `toml:"custom"`
		} `toml:"theme"`
	}
	_, _ = toml.DecodeFile(herdrConfigPath(), &cfg)

	name := cfg.Theme.Name
	if cfg.Theme.AutoSwitch && cfg.Theme.DarkName != "" {
		name = cfg.Theme.DarkName
	}
	name = strings.NewReplacer(" ", "-", "_", "-").Replace(strings.ToLower(name))
	if alias, ok := themeAliases[name]; ok {
		name = alias
	}
	p, ok := palettes[name]
	if !ok {
		p = palettes[defaultTheme]
	}

	c := cfg.Theme.Custom
	for _, o := range []struct {
		token *string
		value string
	}{
		{&p.Accent, c.Accent}, {&p.PanelBg, c.PanelBg}, {&p.Surface0, c.Surface0}, {&p.Surface1, c.Surface1},
		{&p.Overlay0, c.Overlay0}, {&p.Text, c.Text}, {&p.Red, c.Red},
	} {
		if strings.HasPrefix(o.value, "#") {
			*o.token = o.value
		}
	}
	return p
}

func themeColor(value string) color.Color {
	if value == "" {
		return lipgloss.NoColor{}
	}
	return lipgloss.Color(value)
}

// popupStyles are the popup's styles for one palette.
type popupStyles struct {
	accent, surface1, text                     color.Color
	title, dim, err, focus, agent, chip, frame lipgloss.Style
}

func newPopupStyles(p palette) popupStyles {
	accent, surface1, text := themeColor(p.Accent), themeColor(p.Surface1), themeColor(p.Text)
	return popupStyles{
		accent: accent, surface1: surface1, text: text,
		title: lipgloss.NewStyle().Foreground(accent).Bold(true),
		dim:   lipgloss.NewStyle().Foreground(themeColor(p.Overlay0)),
		err:   lipgloss.NewStyle().Foreground(themeColor(p.Red)),
		focus: lipgloss.NewStyle().Foreground(accent).Bold(true),
		agent: lipgloss.NewStyle().Background(accent).Foreground(themeColor(p.PanelBg)).Bold(true).Padding(0, 1),
		chip:  lipgloss.NewStyle().Background(themeColor(p.Surface0)).Foreground(text).Padding(0, 1),
		frame: lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).Padding(0, 1),
	}
}
