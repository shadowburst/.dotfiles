-- Run from the repository root: lua config/noctalia/plugins/voxtype/tests/controls.lua
local binds = {}
package.loaded["lib.variables"] = { mod = "SUPER" }
hl = {
  layer_rule = function() end,
  bind = function(key, command, options) binds[key] = { command = command, options = options } end,
  dsp = { exec_cmd = function(command) return command end },
}
dofile("config/hypr/modules/noctalia.lua")
local toggle = assert(binds["F8"])
local cancel = assert(binds["SHIFT + F8"])
assert(toggle.options == nil and cancel.options == nil)
assert(toggle.command == "noctalia msg plugin shadowburst/voxtype:status all toggle")
assert(cancel.command == "noctalia msg plugin shadowburst/voxtype:status all cancel")
assert(binds["CTRL + Control_R"] == nil and binds["CTRL + SHIFT + Control_R"] == nil)

local calls, errors, status = {}, {}, nil
noctalia = {
  commandExists = function() return true end,
  runStream = function(_, callback) status = callback end,
  json = { decode = function(value) return value end },
  runAsync = function(command, callback, timeout)
    calls[#calls + 1] = { command = command, callback = callback, timeout = timeout }
  end,
  notifyError = function(_, message) errors[#errors + 1] = message end,
}
dofile("config/noctalia/plugins/voxtype/widget.luau")
onIpc("toggle")
assert(calls[1].command:find("systemctl --user start voxtype.service", 1, true))
status({ class = "recording" })
onIpc("toggle")
assert(calls[#calls].command == "voxtype record toggle")
onIpc("cancel")
local call = calls[#calls]
assert(call.command == "voxtype record cancel" and call.timeout == 10000)
call.callback({ exitCode = 0, stderr = "" })
assert(#errors == 0)
call.callback({ exitCode = 1, stderr = "daemon unavailable" })
assert(errors[1] == "daemon unavailable")
call.callback({ exitCode = 1, stderr = "" })
assert(errors[2] == "Could not cancel recording")
print("Noctalia dictation controls: ok")
