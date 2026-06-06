local variables = require("lib.variables")
local mod = variables.mod

hl.config({
  general = { layout = "scrolling" },

  scrolling = {
    fullscreen_on_one_column = true,
    focus_fit_method = 1,
    wrap_focus = false,
    column_width = 0.5,
  },
})

hl.bind(mod .. " + h", hl.dsp.layout("focus l"))
hl.bind(mod .. " + j", hl.dsp.layout("focus d"))
hl.bind(mod .. " + k", hl.dsp.layout("focus u"))
hl.bind(mod .. " + l", hl.dsp.layout("focus r"))
hl.bind(mod .. " + m", hl.dsp.layout("promote"))
hl.bind(mod .. " + comma", hl.dsp.layout("colresize -conf"))
hl.bind(mod .. " + semicolon", hl.dsp.layout("colresize +conf"))
hl.bind(mod .. " + SHIFT + comma", hl.dsp.layout("swapcol l"))
hl.bind(mod .. " + SHIFT + semicolon", hl.dsp.layout("swapcol r"))
hl.bind(mod .. " + SHIFT + h", hl.dsp.layout("consume_or_expel prev"))
hl.bind(mod .. " + SHIFT + l", hl.dsp.layout("consume_or_expel next"))
