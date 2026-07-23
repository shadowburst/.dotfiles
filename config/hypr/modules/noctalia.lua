local variables = require("lib.variables")
local mod = variables.mod

hl.layer_rule({
  name = "noctalia",
  match = {
    namespace = "^noctalia-(bar-.+|notification|dock|panel|attached-panel|osd)$",
  },
  ignore_alpha = 0.5,
  blur = true,
  blur_popups = true,
})

-- Core panels.
hl.bind(mod .. " + Space", hl.dsp.exec_cmd("noctalia msg panel-toggle launcher"))
hl.bind(mod .. " + Escape", hl.dsp.exec_cmd("noctalia msg session lock"))
hl.bind(mod .. " + a", hl.dsp.exec_cmd("noctalia msg panel-toggle control-center"))
hl.bind(mod .. " + x", hl.dsp.exec_cmd("noctalia msg panel-toggle session"))
hl.bind(mod .. " + v", hl.dsp.exec_cmd("noctalia msg panel-toggle clipboard"))

-- Audio/media.
hl.bind("XF86AudioMute", hl.dsp.exec_cmd("noctalia msg volume-mute"))
hl.bind("XF86AudioLowerVolume", hl.dsp.exec_cmd("noctalia msg volume-down"))
hl.bind("XF86AudioRaiseVolume", hl.dsp.exec_cmd("noctalia msg volume-up"))
hl.bind("XF86AudioMicMute", hl.dsp.exec_cmd("noctalia msg mic-mute"))
hl.bind("XF86AudioPrev", hl.dsp.exec_cmd("noctalia msg media previous"))
hl.bind("XF86AudioNext", hl.dsp.exec_cmd("noctalia msg media next"))
hl.bind("XF86AudioPlay", hl.dsp.exec_cmd("noctalia msg media toggle"))
hl.bind("XF86AudioPause", hl.dsp.exec_cmd("noctalia msg media toggle"))
hl.bind(mod .. " + CTRL + Space", hl.dsp.exec_cmd("noctalia msg media toggle"))

-- Brightness.
hl.bind("XF86MonBrightnessDown", hl.dsp.exec_cmd("noctalia msg brightness-down"))
hl.bind("XF86MonBrightnessUp", hl.dsp.exec_cmd("noctalia msg brightness-up"))

-- Screenshots.
hl.bind("print", hl.dsp.exec_cmd("noctalia msg screenshot-region"))
hl.bind("CTRL + print", hl.dsp.exec_cmd("noctalia msg screenshot-fullscreen pick"))
hl.bind(mod .. " + SHIFT + S", hl.dsp.exec_cmd("noctalia msg screenshot-region"))
hl.bind(mod .. " + CTRL + SHIFT + S", hl.dsp.exec_cmd("noctalia msg screenshot-fullscreen pick"))
