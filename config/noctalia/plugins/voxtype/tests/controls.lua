-- Run from the repository root: lua config/noctalia/plugins/voxtype/tests/controls.lua
local binds, commands, timers = {}, {}, {}
package.loaded["lib.variables"] = { mod = "SUPER" }
hl = {
  layer_rule = function() end,
  bind = function(key, callback, options) binds[key] = { callback = callback, options = options } end,
  dsp = { exec_cmd = function(command) return command end },
  dispatch = function(command) commands[#commands + 1] = command end,
  timer = function(callback, options)
    assert(options.timeout == 300 and options.type == "oneshot")
    local timer = { callback = callback, enabled = true }
    function timer:set_enabled(enabled) self.enabled = enabled end
    timers[#timers + 1] = timer
    return timer
  end,
}
dofile("config/hypr/modules/noctalia.lua")
local toggle = assert(binds["CTRL + Control_R"])
local cancel = assert(binds["CTRL + SHIFT + Control_R"])
assert(toggle.options.release and cancel.options.release)
local function expire()
  for _, timer in ipairs(timers) do
    if timer.enabled then
      timer.enabled = false
      timer.callback()
    end
  end
end
toggle.callback()
assert(#commands == 0)
expire()
toggle.callback()
assert(#commands == 0)
toggle.callback()
assert(commands[1] == "noctalia msg plugin shadowburst/voxtype:status all toggle")
expire()
toggle.callback()
cancel.callback()
assert(#commands == 1)
cancel.callback()
assert(commands[2] == "noctalia msg plugin shadowburst/voxtype:status all cancel")

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
