local theme = require("lib.theme")

hl.config({
  general = {
    col = { active_border = theme.accent },
    border_size = 2,
    gaps_in = 2,
    gaps_out = { top = 0, right = 40, bottom = 0, left = 40 },
  },

  dwindle = { force_split = 2 },

  master = {
    allow_small_split = true,
    orientation = "left",
  },

  decoration = {
    blur = {
      enabled = true,
      size = 6,
      xray = true,
    },
    rounding = 6,
    shadow = { enabled = false },
  },

  input = {
    follow_mouse = 1,
    kb_layout = "fr",
    kb_variant = "azerty",
    numlock_by_default = true,
    repeat_delay = 300,
    touchpad = {
      disable_while_typing = true,
      drag_lock = true,
      natural_scroll = true,
    },
    focus_on_close = 1,
  },

  xwayland = { force_zero_scaling = true },

  misc = {
    allow_session_lock_restore = true,
    disable_hyprland_logo = true,
    enable_swallow = true,
    key_press_enables_dpms = true,
    mouse_move_enables_dpms = true,
    on_focus_under_fullscreen = 1,
    session_lock_xray = true,
    swallow_regex = "^kitty$",
    vrr = 0,
  },

  cursor = {
    default_monitor = "DP-1",
  },

  ecosystem = {
    no_donation_nag = true,
    no_update_news = true,
  },
})
