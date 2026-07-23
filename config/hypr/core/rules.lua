hl.env("XDG_CURRENT_DESKTOP", "Hyprland")
hl.env("XDG_SESSION_DESKTOP", "wayland")

hl.monitor({
  output = "",
  mode = "highres",
  position = "auto",
  scale = 1,
})

hl.window_rule({
  name = "calculator-floating",
  match = { class = "org.gnome.Calculator" },
  float = true,
  center = true,
  size = "300 500",
})

hl.window_rule({
  name = "brave-profile-floating",
  match = { initial_class = "brave-(\\w+)-Default" },
  float = true,
  center = true,
  size = "400 600",
})

hl.window_rule({
  name = "brave-open-file-floating",
  match = { initial_class = "brave", initial_title = "Open File" },
  float = true,
  center = true,
  size = "1000 600",
})

hl.window_rule({
  name = "devtools-mcp-workspace",
  match = { initial_class = "brave-browser", initial_title = "about:blank - Brave" },
  workspace = "7 silent",
})

hl.layer_rule({
  name = "selection-no-animation",
  match = { namespace = "selection" },
  no_anim = true,
})

-- Smart gaps
hl.workspace_rule({ workspace = "w[tv1]", gaps_out = 0, gaps_in = 0 })
hl.workspace_rule({ workspace = "f[1]", gaps_out = 0, gaps_in = 0 })
hl.window_rule({ match = { float = false, workspace = "w[tv1]" }, border_size = 0 })
hl.window_rule({ match = { float = false, workspace = "w[tv1]" }, rounding = 0 })
hl.window_rule({ match = { float = false, workspace = "f[1]" }, border_size = 0 })
hl.window_rule({ match = { float = false, workspace = "f[1]" }, rounding = 0 })
