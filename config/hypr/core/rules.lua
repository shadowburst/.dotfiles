hl.env("XDG_CURRENT_DESKTOP", "Hyprland")
hl.env("XDG_SESSION_DESKTOP", "wayland")

hl.monitor({
  output = "",
  mode = "highres",
  position = "auto",
  scale = 1,
})

hl.workspace_rule({ workspace = "1", persistent = true })
hl.workspace_rule({ workspace = "2", persistent = true })
hl.workspace_rule({ workspace = "3", persistent = true })
hl.workspace_rule({ workspace = "4", persistent = true })
hl.workspace_rule({ workspace = "5", persistent = true })
hl.workspace_rule({ workspace = "6", persistent = true })
hl.workspace_rule({ workspace = "7", persistent = true })

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

hl.layer_rule({
  name = "selection-no-animation",
  match = { namespace = "selection" },
  no_anim = true,
})
