local variables = require("lib.variables")
local mod = variables.mod

hl.bind(mod .. " + i", hl.dsp.exec_cmd("voxtype record toggle"))
