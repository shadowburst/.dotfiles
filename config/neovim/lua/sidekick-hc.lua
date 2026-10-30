local Config = require("sidekick.config")
local Herdr = require("sidekick-herdr")
local Session = require("sidekick.cli.session")
local Util = require("sidekick.util")

local M = { BACKEND = "hc", CREATE = "window", TOOL = Herdr.TOOL }

local function machine(address) return address:match("^(.*)/[^/]+$") end

--- Find Neovim, not the app's currently focused space. Never use `hc ls`:
--- core 0.1.14 forwards that request to every configured machine.
function M.scope()
  local current = vim.env.HC_TERMINAL_ID
  if not current or current == "" then
    return nil
  end
  local world = Herdr.json({ "herdr-app", "ls" }, { notify = false })
  local found
  for _, space in ipairs(world and world.spaces or {}) do
    local addresses = {}
    for _, tab in ipairs(space.tabs or {}) do
      for _, terminal in ipairs(tab.terminals or {}) do
        if type(terminal.terminal) == "string" then
          addresses[terminal.terminal] = true
        end
        for _, child in ipairs(terminal.sub_agents or {}) do
          if type(child) == "string" then
            addresses[child] = true
          end
        end
      end
    end
    local on = type(space.machine) == "string" and space.machine or nil
    if addresses[current] and machine(current) == on and type(space.id) == "string" and machine(space.id) == on then
      if found then
        return nil -- an ambiguous app layout must not choose a space for us
      end
      for address in pairs(addresses) do
        if machine(address) ~= on then
          addresses[address] = nil
        end
      end
      found = { id = space.id, label = on and space.id:sub(#on + 2) or space.id, addresses = addresses, machine = on }
    end
  end
  return found
end

function M.terminal(address, scope)
  if not (scope and scope.addresses[address]) then
    return nil
  end
  local record = Herdr.json({ "hc", "get", "--json", address }, { notify = false })
  if record and record.address == address and record.state == "live" and type(record.pid) == "number" then
    return record
  end
end

function M.session_id(address) return ("hc %s %s"):format(vim.env.HC_SOCKET or vim.env.HC_SESSION or "default", address) end

local Backend = { priority = 10 }
Backend.__index = Backend

function Backend:init()
  self.external = false
  self.mux_session = vim.env.HC_SESSION or "default"
end

function Backend:start()
  local scope = M.scope()
  if not scope then
    Util.error("Cannot find HC_TERMINAL_ID in its Herdr app space and machine")
    return
  end
  local cmd =
    { "hc", "run", "--json", "--bg", "--no-parent", "--cwd", self.cwd, "--label", "herdr.space=" .. scope.label }
  if scope.machine then
    vim.list_extend(cmd, { "--on", scope.machine })
  end
  cmd[#cmd + 1] = "--"
  local env = {}
  for key, value in pairs(self.tool.env or {}) do
    if value ~= false then
      env[#env + 1] = key .. "=" .. tostring(value)
    end
  end
  if #env > 0 then
    cmd[#cmd + 1] = "env"
    vim.list_extend(cmd, env)
  end
  vim.list_extend(cmd, self.tool.cmd)
  local record = Herdr.json(cmd, { notify = true })
  if not (record and type(record.address) == "string" and machine(record.address) == scope.machine) then
    return
  end
  self.hc_address = record.address
  self.hc_space = scope.id
  self.id = M.session_id(record.address)
  self.started = true
  -- hc labels create a tab on the app's next refresh, not in the launch reply.
  if not vim.wait(2000, function() return self:is_running() end, 50) then
    Util.error(
      "hc started " .. record.address .. ", but Herdr has not shown its tab; inspect it before starting another"
    )
    return
  end
  Util.info(("Started **%s** in a new Herdr tab"):format(self.tool.name))
end

function Backend:terminal()
  local scope = M.scope()
  return scope and scope.id == self.hc_space and M.terminal(self.hc_address, scope) or nil
end

function Backend:is_running() return self:terminal() ~= nil end

function Backend:send(text)
  self.hc_input_failed = true
  if self:terminal() then
    -- Match core's paste sanitization so text cannot end its own bracketed paste.
    text = text:gsub("\27%[201~", "")
    self.hc_input_failed =
      not require("sidekick-hc-input").send(self.hc_address, "\27[200~" .. text .. "\27[201~", self.tool.mux_focus)
  end
end

function Backend:submit()
  if not self.hc_input_failed and self:terminal() then
    Util.exec({ "hc", "keys", "--json", self.hc_address, "enter" })
  end
end

function Backend:focus()
  return self:terminal() ~= nil
    and Herdr.json({ "herdr-app", "do", "agent.focus", "--terminal", self.hc_address }, { notify = true }) ~= nil
end

function Backend.sessions()
  local ret, scope, tools = {}, M.scope(), Config.tools()
  for address in pairs(scope and scope.addresses or {}) do
    local record = M.terminal(address, scope)
    if record then
      local proc = type(record.foreground) == "table" and record.foreground or record
      local p = {
        pid = proc.pid,
        ppid = record.pid or 0,
        cmd = proc.argv and #proc.argv > 0 and table.concat(proc.argv, " ") or proc.name or "",
        cwd = proc.cwd or record.cwd,
      }
      for _, tool in pairs(tools) do
        if tool:is_proc(p) then
          ret[#ret + 1] = {
            id = M.session_id(address),
            cwd = p.cwd or Session.cwd(),
            tool = tool,
            hc_address = address,
            hc_space = scope.id,
            pids = not scope.machine and { record.pid, proc.pid } or {},
          }
          break -- one state per terminal, even if several tools match
        end
      end
    end
  end
  return ret
end

function M.setup()
  if not vim.env.HC_TERMINAL_ID or vim.env.HC_TERMINAL_ID == "" then
    return false
  end
  if vim.fn.executable("hc") ~= 1 or vim.fn.executable("herdr-app") ~= 1 then
    return false
  end
  Herdr.register(M, Backend)
  return true
end

function M.attached() return Herdr.attached(M.BACKEND) end
function M.focus() return Herdr.focus(M) end
function M.focus_after_send() return Herdr.focus_after_send(M) end
function M.prompt_cb() return Herdr.prompt_cb(M) end

return M
