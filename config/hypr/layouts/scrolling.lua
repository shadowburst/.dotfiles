local variables = require("lib.variables")
local mod = variables.mod

hl.config({
  general = { layout = "scrolling" },

  scrolling = {
    fullscreen_on_one_column = false,
    focus_fit_method = 1,
    follow_min_visible = 1,
    wrap_focus = false,
    column_width = 0.5,
    explicit_column_widths = "0.333,0.5,0.667",
  },
})

hl.window_rule({
  name = "first-column-full-width",
  match = { float = false, workspace = "w[t0]" },
  fullscreen_state = "2 0",
})

hl.bind(mod .. " + h", hl.dsp.layout("focus l"))
hl.bind(mod .. " + j", hl.dsp.layout("focus d"))
hl.bind(mod .. " + k", hl.dsp.layout("focus u"))
hl.bind(mod .. " + l", hl.dsp.layout("focus r"))
hl.bind(mod .. " + m", hl.dsp.layout("promote"))

local function resize_column(command)
  return function()
    local window = hl.get_active_window()
    if window and window.fullscreen == 2 and window.fullscreen_client == 0 then
      hl.dispatch(hl.dsp.window.fullscreen_state({ action = "toggle", internal = 2, client = 0 }))
      hl.dispatch(hl.dsp.layout("colresize 0.5"))
      hl.dispatch(hl.dsp.layout(command))
    end
    hl.dispatch(hl.dsp.layout(command))
  end
end

hl.bind(mod .. " + comma", resize_column("colresize -conf"))
hl.bind(mod .. " + semicolon", resize_column("colresize +conf"))
hl.bind(mod .. " + SHIFT + comma", hl.dsp.layout("swapcol l"))
hl.bind(mod .. " + SHIFT + semicolon", hl.dsp.layout("swapcol r"))
hl.bind(mod .. " + SHIFT + h", hl.dsp.layout("consume_or_expel prev"))
hl.bind(mod .. " + SHIFT + l", hl.dsp.layout("consume_or_expel next"))
