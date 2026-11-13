local Config = require("sidekick.config")
local Herdr = require("sidekick-herdr")
local Session = require("sidekick.cli.session")
local Util = require("sidekick.util")

local M = { BACKEND = "hc", CREATE = "window" }

--- One terminal's full record, or nil when it is not live in `space`.
---@param address string
---@param space? string
---@return table?
function M.terminal(address, space)
  local record = Herdr.json({ "hc", "get", "--json", address }, { notify = false })
  if
    record
    and record.address == address
    and record.state == "live"
    and type(record.labels) == "table"
    and (space == nil or record.labels["herdr.space"] == space)
  then
    return record
  end
end

--- The Herdr app space Neovim's own terminal is shown in. The app labels every
--- terminal it starts with it, and shows any terminal that carries it.
---@return string?
function M.space()
  local current = vim.env.HC_TERMINAL_ID
  local record = current and current ~= "" and M.terminal(current)
  local space = record and record.labels["herdr.space"]
  return type(space) == "string" and space ~= "" and space or nil
end

--- Live terminals in `space` on this core. `machine/t7` addresses are skipped:
--- labels on another machine name that machine's spaces, not ours.
---@param space string
---@return table[]
function M.terminals(space)
  local ret = M.json_list(space)
  local terminals = {} ---@type table[]
  for _, t in ipairs(ret) do
    if type(t.address) == "string" and not t.address:find("/", 1, true) then
      terminals[#terminals + 1] = M.terminal(t.address, space)
    end
  end
  return terminals
end

---@param space string
---@return table[]
function M.json_list(space)
  local ret = Herdr.json({ "hc", "ls", "--json", "--label", "herdr.space=" .. space }, { notify = false })
  return ret and ret.terminals or {}
end

---@param address string
---@return string
function M.session_id(address) return ("hc %s"):format(address) end

---@class sidekick.cli.muxer.Hc: sidekick.cli.Session
---@field hc_address? string
---@field hc_space? string
local Backend = { priority = 10 }
Backend.__index = Backend

function Backend:init()
  self.external = false
  self.mux_session = vim.env.HC_SESSION or "default"
end

function Backend:start()
  local space = M.space()
  if not space then
    Util.error("Cannot find the Herdr app space of HC_TERMINAL_ID")
    return
  end
  -- --no-parent: an agent must outlive the Neovim that started it
  local cmd = { "hc", "run", "--json", "--bg", "--no-parent", "--cwd", self.cwd, "--label", "herdr.space=" .. space }
  cmd[#cmd + 1] = "--"
  local env = {} ---@type string[]
  for key, value in pairs(self.tool.env or {}) do
    if value ~= false then
      env[#env + 1] = key .. "=" .. tostring(value)
    end
  end
  if #env > 0 then
    vim.list_extend(cmd, { "env", unpack(env) })
  end
  vim.list_extend(cmd, self.tool.cmd)
  local record = Herdr.json(cmd, { notify = true })
  if not (record and type(record.address) == "string") then
    return
  end
  self.hc_address = record.address
  self.hc_space = space
  self.id = M.session_id(record.address)
  self.started = true
  Util.info(("Started **%s** in a new Herdr tab"):format(self.tool.name))
end

---@return table?
function Backend:terminal() return self.hc_address and M.terminal(self.hc_address, self.hc_space) end

function Backend:is_running() return self:terminal() ~= nil end

function Backend:send(text)
  self.hc_input_failed = true
  if self:terminal() then
    -- Drop paste-end markers so the text cannot end its own bracketed paste.
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

---@return boolean
function Backend:focus()
  return self:terminal() ~= nil
    and Herdr.json({ "herdr-app", "do", "agent.focus", "--terminal", self.hc_address }, { notify = true }) ~= nil
end

---@type sidekick.cli.session.State[]
function Backend.sessions()
  local ret = {} ---@type sidekick.cli.session.State[]
  local space = M.space()
  if not space then
    return ret
  end
  local tools = Config.tools()
  for _, record in ipairs(M.terminals(space)) do
    local proc = type(record.foreground) == "table" and record.foreground or record
    ---@type sidekick.cli.Proc
    local p = {
      pid = proc.pid,
      ppid = record.pid or 0,
      cmd = proc.argv and table.concat(proc.argv, " ") or proc.name or "",
      cwd = proc.cwd or record.cwd,
    }
    for _, tool in pairs(tools) do
      if tool:is_proc(p) then
        ret[#ret + 1] = {
          id = M.session_id(record.address),
          cwd = p.cwd or Session.cwd(),
          tool = tool,
          hc_address = record.address,
          hc_space = space,
          pids = { record.pid, proc.pid },
        }
        break -- one state per terminal, even if several tools match
      end
    end
  end
  return ret
end

--- Register the backend. Returns false outside a Herdr app terminal.
---@return boolean
function M.setup()
  if not vim.env.HC_TERMINAL_ID or vim.env.HC_TERMINAL_ID == "" then
    return false
  end
  if vim.fn.executable("hc") ~= 1 or vim.fn.executable("herdr-app") ~= 1 then
    return false
  end
  return Herdr.register(M, Backend)
end

function M.attached() return Herdr.attached(M.BACKEND) end
function M.focus() return Herdr.focus(M) end
function M.focus_after_send() return Herdr.focus_after_send(M) end
function M.prompt_cb() return Herdr.prompt_cb(M) end

return M
