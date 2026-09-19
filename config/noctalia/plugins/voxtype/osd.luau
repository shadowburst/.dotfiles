--!nonstrict

local state = "stopped"
local levels = {}
local isOpen = false
local startedAtMs = nil
local lastFrameMs = 0
local spinnerElapsedMs = 0
local spinnerFrame = 1
local spinnerFrames = { "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" }

for _ = 1, 16 do
  table.insert(levels, 0)
end

local function isProcessing()
  return state == "transcribing" or state == "outputting"
end

local function isActive(activeState)
  return activeState == "recording" or activeState == "streaming"
    or activeState == "transcribing" or activeState == "outputting"
end

local function elapsedText()
  local elapsedSeconds = 0
  if startedAtMs ~= nil then
    elapsedSeconds = math.max(0, math.floor((noctalia.nowMs() - startedAtMs) / 1000))
  end
  return string.format("%02d:%02d", math.floor(elapsedSeconds / 60), elapsedSeconds % 60)
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

  local levelBars = {}
  for index, level in ipairs(levels) do
    table.insert(levelBars, ui.box({
      key = "level-" .. tostring(index),
      width = 3,
      height = levelHeight(level),
      radius = 2,
      fill = "primary",
    }))
  end

  panel.render(ui.row({
    gap = 10,
    height = 20,
    align = "center",
    justify = "center",
  }, {
    ui.glyph({ name = "microphone", size = 18, color = "primary" }),
    ui.row({ gap = 2, height = 18, align = "center" }, levelBars),
    ui.label({ text = elapsedText(), width = 44, fontSize = 14, color = "on_surface" }),
  }))
end

local function setState(jsonLine)
  local status = noctalia.json.decode(jsonLine)
  if type(status) ~= "table" then
    return
  end

  local previousState = state
  state = status.class or status.alt or "stopped"
  if isActive(state) and not isActive(previousState) then
    startedAtMs = noctalia.nowMs()
  elseif not isActive(state) then
    startedAtMs = nil
  end
  if isOpen and isActive(state) then
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
  if isOpen and (state == "recording" or state == "streaming") then
    render()
  end
end

function onOpen()
  isOpen = true
  panel.setWantsSecondTicks(true)
  panel.setNeedsFrameTick(true)
  render()
end

function onClose()
  isOpen = false
  panel.setWantsSecondTicks(false)
  panel.setNeedsFrameTick(false)
end

function update()
  if isOpen and isActive(state) then
    render()
  end
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
