-- Herdr has no window transparency setting: let Hyprland fade and blur it like kitty.
hl.window_rule({
  name = "herdr-translucent",
  match = { class = "herdr-app" },
  opacity = "0.9",
})
