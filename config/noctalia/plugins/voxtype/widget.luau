--!nonstrict

local state = "stopped"
local tooltip = "Voxtype stopped"
local spinnerFrame = 1
local spinnerFrames = { "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" }

local function render()
  local color = "on_surface_variant"
  local glyph = "microphone-off"

  if state == "recording" or state == "streaming" then
    color = "error"
    glyph = "microphone"
  elseif state == "transcribing" or state == "outputting" then
    color = "primary"
    glyph = "loader-2"
  elseif state == "idle" then
    color = "primary"
    glyph = "microphone"
  end

  local indicator = ui.glyph({ name = glyph, size = 16, color = color })
  if state == "transcribing" or state == "outputting" then
    indicator = ui.label({ text = spinnerFrames[spinnerFrame], fontSize = 16, color = color })
  end

  barWidget.setTooltip(tooltip)
  barWidget.render(indicator)
end

local function setState(jsonLine)
  local status, err = noctalia.json.decode(jsonLine)
  if status == nil then
    noctalia.log("invalid voxtype status: " .. tostring(err))
    return
  end

  local previousState = state
  state = status.class or status.alt or "stopped"
  tooltip = status.tooltip or ("Voxtype: " .. state)

  local wasActive = previousState == "recording" or previousState == "streaming"
    or previousState == "transcribing" or previousState == "outputting"
  local isActive = state == "recording" or state == "streaming"
    or state == "transcribing" or state == "outputting"
  if isActive ~= wasActive then
    local action = isActive and "panel-open" or "panel-close"
    noctalia.runAsync("noctalia msg " .. action .. " shadowburst/voxtype:osd", function() end)
  end
  render()
end

function update()
  if state == "transcribing" or state == "outputting" then
    spinnerFrame = spinnerFrame % #spinnerFrames + 1
    render()
  end
end

local function toggleRecording()
  local command = "voxtype record toggle"
  if state == "stopped" then
    command = "systemctl --user start voxtype.service && "
      .. "for i in $(seq 1 40); do voxtype record toggle && exit 0; sleep 0.1; done; exit 1"
  end

  noctalia.runAsync(command, function(result)
    if result.exitCode ~= 0 then
      noctalia.notifyError("Voxtype", result.stderr ~= "" and result.stderr or "Could not toggle recording")
    end
  end, 10000)
end

function onClick()
  toggleRecording()
end

function onIpc(event)
  if event == "toggle" then
    toggleRecording()
  end
end

function onRightClick()
  noctalia.runAsync("systemctl --user restart voxtype.service", function(result)
    if result.exitCode ~= 0 then
      noctalia.notifyError("Voxtype", result.stderr ~= "" and result.stderr or "Could not restart service")
    end
  end, 10000)
end

if not noctalia.commandExists("voxtype") then
  tooltip = "Voxtype is not installed"
  render()
else
  noctalia.setUpdateInterval(80)
  noctalia.runStream("while true; do voxtype status --follow --format json; sleep 1; done", setState)
  render()
end
