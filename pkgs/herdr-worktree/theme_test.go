package main

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"charm.land/lipgloss/v2"
)

func writeHerdrConfig(t *testing.T, content string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.toml")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HERDR_CONFIG_PATH", path)
}

func TestLoadPalette(t *testing.T) {
	cases := map[string]struct {
		config string
		accent string
	}{
		"catppuccin accent is the tab blue": {"[theme]\nname = \"catppuccin\"\n", "#89b4fa"},
		"no config value uses the default":  {"", "#89b4fa"},
		"another theme":                     {"[theme]\nname = \"dracula\"\n", palettes["dracula"].Accent},
		"alias":                             {"[theme]\nname = \"Tokyo Night\"\n", palettes["tokyo-night"].Accent},
		"unknown name":                      {"[theme]\nname = \"nope\"\n", "#89b4fa"},
		"auto switch":                       {"[theme]\nname = \"nord\"\nauto_switch = true\ndark_name = \"vesper\"\n", palettes["vesper"].Accent},
		"hex override":                      {"[theme]\nname = \"nord\"\n[theme.custom]\naccent = \"#123456\"\n", "#123456"},
		"non-hex override is ignored":       {"[theme]\nname = \"nord\"\n[theme.custom]\naccent = \"red\"\n", palettes["nord"].Accent},
	}
	for name, c := range cases {
		writeHerdrConfig(t, c.config)
		if got := loadPalette().Accent; got != c.accent {
			t.Errorf("%s: accent = %q, want %q", name, got, c.accent)
		}
	}
}

func TestEveryHerdrThemeHasAPalette(t *testing.T) {
	if len(palettes) != 18 {
		t.Errorf("themes = %d", len(palettes))
	}
	for name, p := range palettes {
		if name != "terminal" && (p.Accent == "" || p.Surface0 == "" || p.Text == "") {
			t.Errorf("%s = %+v", name, p)
		}
	}
	for alias, name := range themeAliases {
		if _, ok := palettes[name]; !ok {
			t.Errorf("alias %s -> %s", alias, name)
		}
	}
}

func TestPopupUsesConfiguredTheme(t *testing.T) {
	m := testModel(t, nil)
	writeHerdrConfig(t, "[theme]\nname = \"nord\"\n")
	m = newPopupModel(m.cfg, nil, nil)
	want := lipgloss.Color(palettes["nord"].Accent)
	if !reflect.DeepEqual(m.styles.accent, want) {
		t.Errorf("accent = %v, want %v", m.styles.accent, want)
	}
}
