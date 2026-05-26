local variables = require("lib.variables")
local mod = variables.mod

hl.on("hyprland.start", function() hl.exec_cmd("noctalia-shell kill; sleep 1.5; noctalia-shell") end)

-- Core.
hl.bind(mod .. " + Space", hl.dsp.exec_cmd("noctalia-shell ipc call launcher toggle"))
hl.bind(mod .. " + x", hl.dsp.exec_cmd("noctalia-shell ipc call sessionMenu toggle"))
hl.bind(mod .. " + a", hl.dsp.exec_cmd("noctalia-shell ipc call calendar toggle"))

-- Audio/media.
hl.bind("XF86AudioMute", hl.dsp.exec_cmd("noctalia-shell ipc call volume muteOutput"))
hl.bind("XF86AudioLowerVolume", hl.dsp.exec_cmd("noctalia-shell ipc call volume decrease"))
hl.bind("XF86AudioRaiseVolume", hl.dsp.exec_cmd("noctalia-shell ipc call volume increase"))
hl.bind("XF86AudioMicMute", hl.dsp.exec_cmd("noctalia-shell ipc call volume muteInput"))
hl.bind("XF86AudioPrev", hl.dsp.exec_cmd("noctalia-shell ipc call media previous"))
hl.bind("XF86AudioNext", hl.dsp.exec_cmd("noctalia-shell ipc call media next"))
hl.bind("XF86AudioPlay", hl.dsp.exec_cmd("noctalia-shell ipc call media playPause"))
hl.bind("XF86AudioPause", hl.dsp.exec_cmd("noctalia-shell ipc call media playPause"))
hl.bind(mod .. " + CTRL + Space", hl.dsp.exec_cmd("noctalia-shell ipc call media playPause"))

-- Brightness.
hl.bind("XF86MonBrightnessDown", hl.dsp.exec_cmd("noctalia-shell ipc call brightness decrease"))
hl.bind("XF86MonBrightnessUp", hl.dsp.exec_cmd("noctalia-shell ipc call brightness increase"))

-- Utility.
hl.bind(mod .. " + v", hl.dsp.exec_cmd("noctalia-shell ipc call launcher clipboard"))
hl.bind(mod .. " + CTRL + r", hl.dsp.exec_cmd("noctalia-shell ipc call plugin:screen-recorder toggle"))
