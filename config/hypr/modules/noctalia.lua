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

-- Main bar
local show_bar = false

---@param show boolean
local function toggle_bar(show)
  if show then
    hl.exec_cmd("noctalia msg bar-show main")
    hl.exec_cmd("noctalia msg panel-open control-center")
    show_bar = true
  else
    hl.exec_cmd("noctalia msg bar-hide main")
    hl.exec_cmd("noctalia msg panel-close control-center")
    show_bar = false
  end
end

hl.on("hyprland.start", function() hl.exec_cmd("sleep 5 && noctalia msg bar-hide main") end)
hl.on("config.reloaded", function() toggle_bar(false) end)

hl.bind(mod .. " + a", function() toggle_bar(not show_bar) end)

-- Core panels.
hl.bind(mod .. " + Space", hl.dsp.exec_cmd("noctalia msg panel-toggle launcher"))
hl.bind(mod .. " + Escape", hl.dsp.exec_cmd("noctalia msg session lock"))
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

-- Screen recording.
hl.bind(mod .. " + CTRL + r", hl.dsp.exec_cmd("noctalia msg scripted-widget screen_recorder focused toggle"))
