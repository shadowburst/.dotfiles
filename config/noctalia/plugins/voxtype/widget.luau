--!nonstrict

local state = "stopped"

local function isActive(activeState)
  return activeState == "recording" or activeState == "streaming"
    or activeState == "transcribing" or activeState == "outputting"
end

local function setState(jsonLine)
  local status, err = noctalia.json.decode(jsonLine)
  if status == nil then
    noctalia.log("invalid voxtype status: " .. tostring(err))
    return
  end

  local wasActive = isActive(state)
  state = status.class or status.alt or "stopped"
  local active = isActive(state)
  if active ~= wasActive then
    local action = active and "panel-open" or "panel-close"
    noctalia.runAsync("noctalia msg " .. action .. " shadowburst/voxtype:osd", function() end)
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

function onIpc(event)
  if event == "toggle" then
    toggleRecording()
  elseif event == "restart" then
    noctalia.runAsync("systemctl --user restart voxtype.service", function(result)
      if result.exitCode ~= 0 then
        noctalia.notifyError("Voxtype", result.stderr ~= "" and result.stderr or "Could not restart service")
      end
    end, 10000)
  end
end

if noctalia.commandExists("voxtype") then
  noctalia.runStream("while true; do voxtype status --follow --format json; sleep 1; done", setState)
else
  noctalia.notifyError("Voxtype", "Voxtype is not installed")
end
