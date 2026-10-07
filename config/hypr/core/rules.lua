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
  size = "400 620",
})

hl.window_rule({
  name = "brave-profile-floating",
  match = { initial_class = "brave-(\\w+)-Default" },
  float = true,
  center = true,
  size = "560 760",
})

hl.window_rule({
  name = "brave-open-file-floating",
  match = { initial_class = "brave(-origin)?", initial_title = "Open File" },
  float = true,
  center = true,
  size = "1000 600",
})

hl.layer_rule({
  name = "selection-no-animation",
  match = { namespace = "selection" },
  no_anim = true,
})

hl.window_rule({ match = { float = false, fullscreen = true }, border_size = 0 })
