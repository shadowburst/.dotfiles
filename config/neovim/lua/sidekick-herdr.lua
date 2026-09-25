local Cli = require("sidekick.cli")
local Config = require("sidekick.config")
local Session = require("sidekick.cli.session")
local Util = require("sidekick.util")

---@class sidekick.herdr.Pane
---@field id string herdr pane id
---@field terminal_id string herdr terminal id, stable for the pane's lifetime
---@field workspace_id? string
---@field cwd? string

local M = {}

M.BACKEND = "herdr"
M.CREATE = "window" -- a tab in the session nvim is already running inside
M.DEFAULT_SESSION = "default"
M.TOOL = "pi"

--- Build a herdr command. Deliberately never passes `--session`: this backend
--- only ever drives the session nvim is already running inside (see `setup`).
---@param args string[]
---@return string[]
function M.cmd(args) return vim.list_extend({ "herdr" }, args) end

--- Run a herdr command and decode its JSON response.
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
    return {} -- commands like `pane run` succeed silently
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

--- The session identity. Both attach (`launch`) and discovery (`sessions`) must
--- produce this exact string: sidekick prunes any attach whose id is not rediscovered.
---@param terminal_id string
---@return string
function M.session_id(terminal_id) return ("herdr %s"):format(terminal_id) end

---@param raw table a pane as herdr's JSON reports it
---@return sidekick.herdr.Pane?
function M.pane_from(raw)
  if not (raw and raw.terminal_id) then
    return nil
  end
  return {
    id = raw.pane_id,
    terminal_id = raw.terminal_id,
    workspace_id = raw.workspace_id,
    cwd = raw.foreground_cwd or raw.cwd,
  }
end

--- List the panes of the ambient herdr session. Panes without a `terminal_id` are
--- dropped: it is the session identity, and a pane we cannot name is a pane we
--- cannot keep attached.
---@return sidekick.herdr.Pane[]
function M.panes()
  local ret = M.json(M.cmd({ "pane", "list" }), { notify = false })
  local panes = {} ---@type sidekick.herdr.Pane[]
  for _, raw in ipairs(ret and ret.result and ret.result.panes or {}) do
    local pane = M.pane_from(raw)
    if pane then
      panes[#panes + 1] = pane
    end
  end
  return panes
end

---@param pane_id string
---@return table?
function M.process_info(pane_id)
  local ret = M.json(M.cmd({ "pane", "process-info", "--pane", pane_id }), { notify = false })
  return ret and ret.result and ret.result.process_info
end

--- Shell-quote an argv into a single command string.
---@param cmd string[]
---@return string
function M.shell_cmd(cmd) return table.concat(vim.tbl_map(vim.fn.shellescape, cmd), " ") end

---@param env? table<string, string|false>
---@return string[]
function M.env_args(env)
  local ret = {} ---@type string[]
  for key, value in pairs(env or {}) do
    if value ~= false then
      -- herdr can set env for a new pane but has no way to unset one
      ret[#ret + 1] = "--env"
      ret[#ret + 1] = ("%s=%s"):format(key, tostring(value))
    end
  end
  return ret
end

---@class sidekick.cli.muxer.Herdr: sidekick.cli.Session
---@field herdr_pane_id? string
---@field herdr_terminal_id? string
local Backend = {}
Backend.__index = Backend
Backend.priority = 10 -- below the in-editor terminal backend, so an editor session wins

function Backend:init()
  -- Not external: we started this session in a herdr tab, so sidekick must not
  -- also offer to start a second one. `external` does not open a window here --
  -- that is decided by `start`/`attach` returning a Cmd, which we never do.
  self.external = false
  self.mux_session = vim.env.HERDR_SESSION or M.DEFAULT_SESSION
end

---@return sidekick.cli.terminal.Cmd?
function Backend:start()
  local pane = self:create_tab()
  if pane and self:launch(pane) then
    Util.info(("Started **%s** in a new Herdr tab"):format(self.tool.name))
  end
end

---@return sidekick.herdr.Pane?
function Backend:create_tab()
  if not vim.env.HERDR_WORKSPACE_ID then
    Util.error("Herdr did not tell us which workspace this pane belongs to")
    return nil
  end
  local cmd = M.cmd({
    "tab",
    "create",
    "--workspace",
    vim.env.HERDR_WORKSPACE_ID,
    "--cwd",
    self.cwd,
    "--label",
    self.sid,
    "--no-focus",
  })
  vim.list_extend(cmd, M.env_args(self.tool.env))
  local ret = M.json(cmd, { notify = true })
  return M.pane_from(ret and ret.result and ret.result.root_pane)
end

--- Replace the new pane's shell with the tool, so the pane dies with the tool.
---@param pane sidekick.herdr.Pane
---@return boolean
function Backend:launch(pane)
  local cmd = M.cmd({ "pane", "run", pane.id, "exec " .. M.shell_cmd(self.tool.cmd) })
  if not M.json(cmd, { notify = true }) then
    M.json(M.cmd({ "pane", "close", pane.id }), { notify = false })
    return false
  end
  self.herdr_pane_id = pane.id
  self.herdr_terminal_id = pane.terminal_id
  self.id = M.session_id(pane.terminal_id)
  self.cwd = pane.cwd or self.cwd
  self.started = true
  return true
end

---@return sidekick.herdr.Pane?
function Backend:pane()
  for _, pane in ipairs(M.panes()) do
    if
      (self.herdr_terminal_id and pane.terminal_id == self.herdr_terminal_id)
      or (not self.herdr_terminal_id and pane.id == self.herdr_pane_id)
    then
      return pane
    end
  end
end

function Backend:is_running() return self:pane() ~= nil end

---@return string?
function Backend:pane_id()
  local pane = self:pane()
  return pane and pane.id
end

function Backend:send(text)
  local pane_id = self:pane_id()
  if not pane_id then
    return
  end

  local function send() Util.exec(M.cmd({ "pane", "send-text", pane_id, text })) end

  if self.tool.mux_focus then
    -- some TUIs ignore input until they have seen a focus-in event
    Util.exec(M.cmd({ "pane", "send-keys", pane_id, "Escape", "[", "I" }))
    vim.defer_fn(send, 50)
  else
    send()
  end
end

function Backend:submit()
  local pane_id = self:pane_id()
  if pane_id then
    Util.exec(M.cmd({ "pane", "send-keys", pane_id, "Enter" }))
  end
end

---@type sidekick.cli.session.State[]
function Backend.sessions()
  local ret = {} ---@type sidekick.cli.session.State[]
  local tools = Config.tools()

  for _, pane in ipairs(M.panes()) do
    local info = M.process_info(pane.id)
    local pids = {} ---@type integer[]
    if info then
      pids = { info.shell_pid }
      for _, proc in ipairs(info.foreground_processes or {}) do
        pids[#pids + 1] = proc.pid
      end
    end

    local matched = false
    for _, proc in ipairs(info and info.foreground_processes or {}) do
      local cmd = proc.cmdline or (proc.argv and table.concat(proc.argv, " ")) or proc.name or ""
      ---@type sidekick.cli.Proc
      local p = { pid = proc.pid, ppid = info.shell_pid or 0, cmd = cmd, cwd = proc.cwd or pane.cwd }
      for _, tool in pairs(tools) do
        if tool:is_proc(p) then
          ret[#ret + 1] = {
            id = M.session_id(pane.terminal_id),
            cwd = p.cwd or pane.cwd or Session.cwd(),
            tool = tool,
            herdr_pane_id = pane.id,
            herdr_terminal_id = pane.terminal_id,
            workspace_id = pane.workspace_id,
            pids = pids,
          }
          matched = true
          break
        end
      end
      -- one state per pane: two matches would collide on the session id, which
      -- sidekick asserts against
      if matched then
        break
      end
    end
  end

  return ret
end

--- Register the backend. Returns false when nvim is not running inside herdr,
--- which leaves sidekick on its own terminal backend instead of reaching for a
--- multiplexer that is not there.
---@return boolean
function M.setup()
  if vim.env.HERDR_ENV ~= "1" or vim.fn.executable(M.BACKEND) ~= 1 then
    return false
  end

  if not Config.herdr_validated then
    local validate = Config.validate
    Config.validate = function(key, t)
      if key == "cli.mux.backend" and type(t) == "table" then
        -- extend, never replace: sidekick's own tmux/zellij stay valid
        t = vim.list_extend(vim.deepcopy(t), vim.tbl_keys(Session.backends))
      end
      return validate(key, t)
    end
    Config.herdr_validated = true
  end

  Session.register(M.BACKEND, Backend)
  Config.cli.mux.enabled = true
  Config.cli.mux.backend = M.BACKEND
  Config.cli.mux.create = M.CREATE

  vim.api.nvim_create_autocmd("User", {
    group = vim.api.nvim_create_augroup("sidekick_herdr", { clear = true }),
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

--- The attached herdr session, if any. No side effects: `toggle` needs to know
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

---@param session sidekick.cli.Session
---@return boolean
local function focus_session(session)
  local pane_id = session:pane_id()
  return pane_id ~= nil and M.json(M.cmd({ "agent", "focus", pane_id }), { notify = true }) ~= nil
end

--- Bring the terminal emulator to the attached agent. Silent when there is
--- nothing to focus: this runs as the last step of a send keymap, not on its own.
---@return boolean
function M.focus()
  local session = M.attached()
  return session ~= nil and focus_session(session)
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
    return focus_session(session)
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
      Cli.send({ text = text, filter = { name = M.TOOL } })
      M.focus_after_send()
    end
  end
end
return M
