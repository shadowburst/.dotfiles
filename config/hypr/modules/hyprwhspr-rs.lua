local variables = require("lib.variables")
local mod = variables.mod

hl.bind(mod .. " + i", hl.dsp.exec_cmd("hyprwhspr-rs record start"))
hl.bind(mod .. " + i", hl.dsp.exec_cmd("hyprwhspr-rs record stop"), { release = true })
