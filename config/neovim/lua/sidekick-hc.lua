local Cli = require("sidekick.cli")
local Config = require("sidekick.config")
local Session = require("sidekick.cli.session")
local Util = require("sidekick.util")

local M = { BACKEND = "hc", CREATE = "window" }

--- Run a command and decode its JSON response.
---@param cmd string[]
---@param opts? {notify?:boolean}
---@return table?
function M.json(cmd, opts)
  opts = opts or {}
  local lines = Util.exec(cmd, { notify = opts.notify == true })
  if not lines then
    return nil
  end
  if #lines == 0 then
    return {}
  end
  local ok, ret = pcall(vim.json.decode, table.concat(lines, "\n"))
  if not ok or type(ret) ~= "table" then
    if opts.notify ~= false then
      Util.error(("Failed to parse Herdr response: `%s`"):format(table.concat(cmd, " ")))
    end
    return nil
  end
  return ret
end

--- One terminal's full record, or nil when it is not live in `space`.
---@param address string
---@param space? string
---@return table?
function M.terminal(address, space)
  local record = M.json({ "hc", "get", "--json", address }, { notify = false })
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
  local ret = M.json({ "hc", "ls", "--json", "--label", "herdr.space=" .. space }, { notify = false })
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
  local record = M.json(cmd, { notify = true })
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
    and M.json({ "herdr-app", "do", "agent.focus", "--terminal", self.hc_address }, { notify = true }) ~= nil
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
  -- extend, never replace: sidekick's own tmux/zellij stay valid
  local validate = Config.validate
  Config.validate = function(key, t)
    if key == "cli.mux.backend" and type(t) == "table" then
      t = vim.list_extend(vim.deepcopy(t), vim.tbl_keys(Session.backends))
    end
    return validate(key, t)
  end

  Session.register(M.BACKEND, Backend)
  Config.cli.mux.enabled = true
  Config.cli.mux.backend = M.BACKEND
  Config.cli.mux.create = M.CREATE

  vim.api.nvim_create_autocmd("User", {
    group = vim.api.nvim_create_augroup("sidekick_hc", { clear = true }),
    pattern = "SidekickCliAttach",
    callback = function()
      if M.armed then
        M.armed = false
        M.focus()
      end
    end,
  })
  return true
end

--- The attached hc session, if any. No side effects: `toggle` needs to know
--- whether something is attached without attaching it.
---@return sidekick.cli.Session?
function M.attached()
  local cwd = Session.cwd()
  ---@type sidekick.cli.Session?
  local fallback
  for _, session in pairs(Session.attached()) do
    if session.backend == M.BACKEND then
      if session.cwd == cwd then
        return session
      end
      fallback = fallback or session
    end
  end
  return fallback
end

--- Bring the app to the attached agent. Silent when there is nothing to
--- focus: this runs as the last step of a send keymap, not on its own.
---@return boolean
function M.focus()
  local session = M.attached()
  return session ~= nil and session:focus()
end

--- Take the user to the agent a send keymap just sent to.
---
--- When a session is already attached the send cannot block, so focus straight
--- away. Otherwise sidekick first has to ask which agent to use, and it only
--- emits `SidekickCliAttach` once that choice is made -- and not at all when the
--- session was already attached, so riding that event alone would work exactly
--- once.
function M.focus_after_send()
  local session = M.attached()
  if session then
    return session:focus()
  end
  M.armed = true
  -- ponytail: dismissing the picker attaches nothing, so the arm has to expire
  -- on its own rather than firing on some later, unrelated attach
  vim.defer_fn(function() M.armed = false end, 2000)
end

--- Callback for `Cli.prompt`. It is invoked as `(msg, text)` where `text` is the
--- rendered `sidekick.Text[]` that `Cli.send` wants; `msg` is only the preview
--- string, and handing that over instead sends an empty prompt.
---@return fun(msg?:string, text?:sidekick.Text[])
function M.prompt_cb()
  return function(_, text)
    if text then
      Cli.send({ text = text, filter = { cwd = true } })
      M.focus_after_send()
    end
  end
end

return M
