--!nonstrict

local state = "recording"
local levels = {}
local isOpen = false
local lastFrameMs = 0
local spinnerElapsedMs = 0
local spinnerFrame = 1
local spinnerFrames = { "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" }

for _ = 1, 20 do
  table.insert(levels, 0)
end

local function isProcessing()
  return state == "transcribing" or state == "outputting"
end

local function levelHeight(value)
  return math.max(3, math.min(18, math.floor(value * 200)))
end

local function render()
  if isProcessing() then
    panel.render(ui.row({ height = 20, align = "center", justify = "center" }, {
      ui.label({ text = spinnerFrames[spinnerFrame], fontSize = 18, color = "primary" }),
    }))
    return
  end

  local children = {
    ui.glyph({ name = "microphone", size = 18, color = "primary" }),
  }

  for index, level in ipairs(levels) do
    table.insert(children, ui.box({
      key = "level-" .. tostring(index),
      width = 3,
      height = levelHeight(level),
      radius = 2,
      fill = "primary",
    }))
  end

  panel.render(ui.row({
    gap = 3,
    height = 20,
    align = "center",
    justify = "center",
  }, children))
end

local function setState(jsonLine)
  local status = noctalia.json.decode(jsonLine)
  if type(status) ~= "table" then
    return
  end

  state = status.class or status.alt or "stopped"
  if isOpen then
    render()
  end
end

local function setLevel(jsonLine)
  local frame = noctalia.json.decode(jsonLine)
  if type(frame) ~= "table" or type(frame.peak) ~= "number" then
    return
  end

  local now = noctalia.nowMs()
  if now - lastFrameMs < 33 then
    return
  end
  lastFrameMs = now

  table.remove(levels, 1)
  table.insert(levels, frame.peak)
  if isOpen and not isProcessing() then
    render()
  end
end

function onOpen()
  isOpen = true
  panel.setNeedsFrameTick(true)
  render()
end

function onClose()
  isOpen = false
  panel.setNeedsFrameTick(false)
end

function onFrameTick(deltaMs)
  if not isProcessing() then
    return
  end

  spinnerElapsedMs = spinnerElapsedMs + tonumber(deltaMs)
  if spinnerElapsedMs >= 80 then
    spinnerElapsedMs = spinnerElapsedMs % 80
    spinnerFrame = spinnerFrame % #spinnerFrames + 1
    render()
  end
end

noctalia.runStream("while true; do voxtype status --follow --format json; sleep 1; done", setState)
noctalia.runStream("while true; do voxtype-audio-bridge; sleep 1; done", setLevel)
