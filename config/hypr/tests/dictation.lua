-- Run from the repository root: lua config/hypr/tests/dictation.lua
local binds = {}
package.loaded["lib.variables"] = { mod = "SUPER" }
hl = {
  layer_rule = function() end,
  bind = function(key, command, options) binds[key] = { command = command, options = options } end,
  dsp = { exec_cmd = function(command) return command end },
}
dofile("config/hypr/modules/noctalia.lua")
local toggle = assert(binds["SUPER + i"])
local cancel = assert(binds["SUPER + SHIFT + i"])
assert(toggle.options == nil and cancel.options == nil)
assert(toggle.command == "hex dictation toggle")
assert(cancel.command == "hex dictation cancel")
for _, bind in pairs(binds) do
  assert(not bind.command:find("voxtype", 1, true))
end
print("Hex dictation controls: ok")
