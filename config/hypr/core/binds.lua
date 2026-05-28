local variables = require("lib.variables")
local mod = variables.mod
local terminal = variables.terminal
local browser = variables.browser

-- Mouse.
hl.bind(mod .. " + mouse:272", hl.dsp.window.drag(), { mouse = true })
hl.bind(mod .. " + mouse:273", hl.dsp.window.resize(), { mouse = true })

-- Windows.
hl.bind(mod .. " + c", hl.dsp.window.float({ action = "toggle" }))
hl.bind(mod .. " + f", hl.dsp.window.fullscreen({ action = "toggle" }))
hl.bind(mod .. " + q", hl.dsp.window.close())
hl.bind(mod .. " + SHIFT + p", hl.dsp.window.pin())

local workspace_keys = {
  { "ampersand", 1 },
  { "eacute", 2 },
  { "quotedbl", 3 },
  { "apostrophe", 4 },
  { "parenleft", 5 },
  { "minus", 6 },
  { "egrave", 7 },
}

for _, item in ipairs(workspace_keys) do
  local key = item[1]
  local workspace = tostring(item[2])
  hl.bind(mod .. " + " .. key, hl.dsp.focus({ workspace = workspace, on_current_monitor = true }))
  hl.bind(mod .. " + SHIFT + " .. key, hl.dsp.window.move({ workspace = workspace, follow = false }))
  hl.bind(mod .. " + SHIFT + CTRL + " .. key, hl.dsp.window.move({ workspace = workspace }))
end

-- Monitors.
hl.bind(mod .. " + tab", hl.dsp.workspace.swap_monitors({ monitor1 = "current", monitor2 = "-1" }))
hl.bind(mod .. " + CTRL + h", hl.dsp.focus({ monitor = "l" }))
hl.bind(mod .. " + CTRL + j", hl.dsp.focus({ monitor = "d" }))
hl.bind(mod .. " + CTRL + k", hl.dsp.focus({ monitor = "u" }))
hl.bind(mod .. " + CTRL + l", hl.dsp.focus({ monitor = "r" }))
hl.bind(mod .. " + SHIFT + CTRL + h", hl.dsp.window.move({ monitor = "l" }))
hl.bind(mod .. " + SHIFT + CTRL + j", hl.dsp.window.move({ monitor = "d" }))
hl.bind(mod .. " + SHIFT + CTRL + k", hl.dsp.window.move({ monitor = "u" }))
hl.bind(mod .. " + SHIFT + CTRL + l", hl.dsp.window.move({ monitor = "r" }))

-- Applications.
hl.bind(mod .. " + return", hl.dsp.exec_cmd("uwsm app -- " .. terminal))
hl.bind(mod .. " + b", hl.dsp.exec_cmd("uwsm app -- " .. browser))
hl.bind(mod .. " + d", function()
  local default_workspace_commands = {
    [1] = browser,
    [2] = terminal .. " -e tv kitty-sessions",
    [3] = "discord",
    [4] = terminal .. " -e yazi",
    [5] = "steam",
    [6] = "gimp",
    [7] = terminal,
  }
  local workspace = hl.get_active_workspace()
  local command = workspace and default_workspace_commands[workspace.id]

  if command then
    hl.exec_cmd("uwsm app -- " .. command)
  end
end)
hl.bind(mod .. " + e", hl.dsp.exec_cmd("uwsm app -- " .. terminal .. " -e yazi"))
hl.bind("CTRL + SHIFT + escape", hl.dsp.exec_cmd("uwsm app -- " .. terminal .. " -e btop"))
hl.bind("XF86Calculator", hl.dsp.exec_cmd("uwsm app -- gnome-calculator"))

-- Other.
hl.bind("CTRL + ALT + delete", hl.dsp.exec_cmd("hyprctl kill"))
hl.bind(mod .. " + p", hl.dsp.exec_cmd("hyprpicker -a"))
