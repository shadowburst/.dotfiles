hl.config({
  gestures = {
    workspace_swipe_distance = 200,
    workspace_swipe_min_speed_to_force = 10,
  },
})

hl.gesture({ fingers = 3, direction = "vertical", action = "workspace" })
hl.gesture({ fingers = 3, direction = "horizontal", action = "scroll_move" })
hl.gesture({ fingers = 2, direction = "pinch", mods = "SUPER", action = "cursor_zoom", zoom_level = 2, mode = "live" })
