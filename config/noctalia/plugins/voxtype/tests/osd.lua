-- Run: lua config/noctalia/plugins/voxtype/tests/osd.lua
local streams, card = {}, nil
local settings = {
  osd = { background_opacity = 0.9, border = true, border_color = "outline", border_width = 1 },
  ["shell.corner_radius_scale"] = 0.25,
}
noctalia = {
  getSetting = function(path) return assert(settings[path], path) end,
  nowMs = function() return 1000 end,
  json = { decode = function(value) return value end },
  runStream = function(command, callback) streams[command] = callback end,
}
panel = {
  render = function(tree) card = tree end,
  setWantsSecondTicks = function() end,
  setNeedsFrameTick = function() end,
}
ui = setmetatable({}, {
  __index = function(_, kind)
    return function(props, children) return { kind = kind, props = props, children = children } end
  end,
})
dofile(arg[0]:match("^(.*[/])") .. "../osd.luau")
local setState = assert(streams["while true; do voxtype status --follow --format json; sleep 1; done"])
onOpen()
for _, state in ipairs({ "recording", "streaming", "transcribing", "outputting" }) do
  setState({ class = state })
  assert(card.props.padding == -14, "host inset must be cancelled")
  local background = assert(card.children[1])
  assert(background.props.fill == "surface/0.9", state .. ": native background missing")
  assert(background.props.border == "outline" and background.props.borderWidth == 1)
  assert(background.props.radius == 3)
  assert(background.props.width == 190 and background.props.height == 48)
  assert(background.props.opacity == nil, "background opacity must not fade the content")
  assert(#background.children == ((state == "recording" or state == "streaming") and 3 or 1))
end
settings.osd.background_opacity = 0.75
settings.osd.border_color = "primary"
settings.osd.border_width = 2
settings["shell.corner_radius_scale"] = 0.5
update()
local props = card.children[1].props
assert(props.fill == "surface/0.75" and props.radius == 6)
assert(props.border == "primary" and props.borderWidth == 2)
settings.osd.border = false
update()
props = card.children[1].props
assert(props.border == nil and props.borderWidth == 0)
onClose()
print("OSD card styling: ok (all active states and native setting changes)")
