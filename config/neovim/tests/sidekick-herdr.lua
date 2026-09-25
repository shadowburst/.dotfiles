-- Run: nvim -u NONE -l config/neovim/tests/sidekick-herdr.lua
vim.opt.runtimepath:prepend(vim.fn.stdpath("config"))
vim.cmd.packadd("sidekick.nvim")

local Config = require("sidekick.config")
local Session = require("sidekick.cli.session")
local State = require("sidekick.cli.state")
local Util = require("sidekick.util")

local calls, replies, notes, picks = {}, {}, {}, {}
local system = vim.system
local notify = vim.notify
local select = vim.ui.select

--- Record the picker instead of opening it, so a regression shows up as a failed
--- assertion rather than a headless nvim waiting on input.
vim.ui.select = function(items, opts) picks[#picks + 1] = { items = items, opts = opts } end

vim.notify = function(msg) notes[#notes + 1] = tostring(msg) end

--- Stub every shell-out so the test never touches a real multiplexer.
---@param cmd string[]
local function stub(cmd)
  calls[#calls + 1] = cmd
  local reply = replies[table.concat(cmd, " ")]
  return {
    wait = function()
      if not reply then
        return { code = 1, stdout = "", stderr = "unstubbed: " .. table.concat(cmd, " ") }
      end
      return { code = 0, stdout = reply, stderr = "" }
    end,
  }
end

---@return string[]
local function issued(match)
  local ret = {}
  for _, cmd in ipairs(calls) do
    if not match or table.concat(cmd, " "):find(match, 1, true) then
      ret[#ret + 1] = table.concat(cmd, " ")
    end
  end
  return ret
end

local running

local function reset()
  vim.wait(50) -- Util.notify defers, so let the previous block's land before clearing
  calls, replies, notes, picks = {}, {}, {}, {}
  -- sidekick's own process walker, reached via the tmux backend that `Session.setup`
  -- registers because tmux is installed. Nothing for it to find here.
  replies[("ps -u %s -ww -o pid,ppid,args"):format(vim.env.USER or "")] = ""
  -- the opencode backend shells out to lsof; keep the host's real agents out of this test
  replies["lsof -w -iTCP -sTCP:LISTEN -P -n -Fn -Fp"] = ""
  vim.system = stub
  package.loaded["sidekick-herdr"] = nil
  Session.backends = {}
  Session.did_setup = false
  Session._attached = {}
  Config.cli.mux = { enabled = false, backend = "tmux", create = "terminal", split = { vertical = true, size = 0.5 } }
end

--- Only our backend's discoveries. `Session.sessions()` spans every registered
--- backend, so indexing it would depend on hash order.
---@return sidekick.cli.Session[]
local function discovered()
  local ret = {}
  for _, session in ipairs(Session.sessions()) do
    if session.backend == "herdr" then
      ret[#ret + 1] = session
    end
  end
  return ret
end

local CWD = vim.fs.normalize(vim.fn.fnamemodify(vim.fn.tempname(), ":p"))
vim.fn.mkdir(CWD, "p")
vim.cmd.cd(vim.fn.fnameescape(CWD)) -- so "same directory" candidates are real
local PANE = "w1:p2"
local TERMINAL = "term_abc"

---@param opts? {untagged?:boolean, workspace?:string, pane?:string, terminal?:string, cwd?:string, title?:string, list?:table[]}
local function pane_list(opts)
  opts = opts or {}
  local panes = {}
  for _, p in ipairs(opts.list or { opts }) do
    panes[#panes + 1] = {
      pane_id = p.pane or PANE,
      terminal_id = p.terminal or TERMINAL,
      workspace_id = p.workspace or opts.workspace or "w1",
      cwd = p.cwd or opts.cwd or CWD,
      foreground_cwd = p.cwd or opts.cwd or CWD,
      terminal_title_stripped = p.title or opts.title,
    }
  end
  if opts.untagged then
    panes[#panes + 1] = { pane_id = "w1:p9", workspace_id = opts.workspace or "w1", cwd = CWD, foreground_cwd = CWD }
  end
  replies["herdr pane list"] = vim.json.encode({ result = { panes = panes } })
  for _, pane in ipairs(panes) do
    if pane.terminal_id then
      -- the agent runs where its tab was created
      running({ pane = pane.pane_id, cwd = pane.cwd })
    end
  end
end

---@param opts? {pane?:string, cmd?:string, shell?:number, pid?:number, cwd?:string}
function running(opts)
  opts = opts or {}
  local pane = opts.pane or PANE
  replies["herdr pane process-info --pane " .. pane] = vim.json.encode({
    result = {
      process_info = {
        shell_pid = opts.shell or 4242,
        foreground_processes = {
          { pid = opts.pid or 4243, cmdline = opts.cmd or "/nix/store/xxx/bin/pi", cwd = opts.cwd or CWD },
        },
      },
    },
  })
end

-- 1. gated on herdr: registers the backend and silences the unknown-backend validation.
reset()
vim.env.HERDR_ENV = nil
require("sidekick-herdr").setup()
assert(next(Session.backends) == nil, "must not register outside herdr")
assert(Config.cli.mux.enabled == false, "mux must stay disabled outside herdr")

reset()
vim.env.HERDR_ENV = "1"
vim.env.HERDR_WORKSPACE_ID = "w1"
require("sidekick").setup({ nes = { enabled = false }, cli = { mux = { enabled = true, backend = "herdr" } } })
require("sidekick-herdr").setup()
vim.wait(300) -- sidekick validates its config on a scheduled tick
assert(Session.backends.herdr, "must register the herdr backend inside herdr")
assert(Config.cli.mux.backend == "herdr", "backend must be herdr")
assert(Config.cli.mux.enabled == true, "mux must be enabled")
assert(#notes == 0, "setup must not notify: " .. vim.inspect(notes))
assert(Session.new({ tool = "pi", cwd = CWD }).backend == "herdr", "sessions must use the herdr backend")

-- 2. start(): a herdr tab in the ambient session, launched with `pane run`, no terminal window.
reset()
vim.env.HERDR_ENV = "1"
vim.env.HERDR_WORKSPACE_ID = "w1"
require("sidekick-herdr").setup()
local session = Session.new({ tool = "pi", cwd = CWD })
assert(session.external == false, "our sessions are ours, not pre-existing ones")
pane_list()
replies["herdr tab create --workspace w1 --cwd " .. CWD .. " --label " .. session.sid .. " --no-focus"] =
  vim.json.encode({ result = { root_pane = { pane_id = PANE, terminal_id = TERMINAL, cwd = CWD } } })
replies["herdr pane run " .. PANE .. " exec 'pi'"] = ""
session:start()
assert(#issued("terminal attach") == 0, "must not ask sidekick for a terminal window")
assert(
  issued("tab create")[1]
    == "herdr tab create --workspace w1 --cwd " .. CWD .. " --label " .. session.sid .. " --no-focus",
  "must create a tab in the ambient workspace: " .. vim.inspect(issued())
)
assert(issued("pane run")[1] == "herdr pane run " .. PANE .. " exec 'pi'", "must launch via pane run")
assert(#issued("--session") == 0, "must never target a named session: " .. vim.inspect(issued()))

-- 3. identity: the id used at attach time is the id discovery reports, or the attach is silently pruned.
assert(session.id == "herdr " .. TERMINAL, "id must derive from terminal_id, got " .. session.id)
assert(session:is_running(), "the started session must be running")
assert(session:pane_id() == PANE, "pane_id must resolve")

reset()
vim.env.HERDR_ENV = "1"
require("sidekick-herdr").setup()
pane_list()
running()
local found = discovered()
assert(#found == 1, "must discover the running pi pane, got " .. #found)
assert(found[1].id == "herdr " .. TERMINAL, "discovery id must match the attach id, got " .. found[1].id)
assert(found[1].tool.name == "pi", "must match pi by process")
assert(found[1].cwd == CWD, "must take cwd from the pane")
assert(vim.tbl_contains(found[1].pids, 4243), "must record the agent pid")

pane_list({ untagged = true })
assert(#discovered() == 1, "panes without a terminal_id must be skipped, not given a divergent id")

-- 3b. two matching processes in one pane must yield one state: two would collide
-- on the session id, which sidekick asserts against.
reset()
vim.env.HERDR_ENV = "1"
require("sidekick-herdr").setup()
pane_list()
replies["herdr pane process-info --pane " .. PANE] = vim.json.encode({
  result = {
    process_info = {
      shell_pid = 4242,
      foreground_processes = {
        { pid = 4243, cmdline = "/nix/store/xxx/bin/pi", cwd = CWD },
        { pid = 4244, cmdline = "/nix/store/xxx/bin/pi --resume", cwd = CWD },
      },
    },
  },
})
assert(#discovered() == 1, "one state per pane, got " .. #discovered())

-- 3c. a missing workspace id must fail loudly, not truncate the argv
reset()
vim.env.HERDR_ENV = "1"
vim.env.HERDR_WORKSPACE_ID = nil
require("sidekick-herdr").setup()
local orphan = Session.new({ tool = "pi", cwd = CWD })
orphan:start()
vim.wait(200) -- Util.error notifies on a scheduled tick
assert(#issued("tab create") == 0, "must not build a tab command without a workspace")
assert(#notes > 0, "must say why it did nothing")
vim.env.HERDR_WORKSPACE_ID = "w1"

-- 4. I/O: literal text, no implicit newline, submit is an explicit Enter.
reset()
vim.env.HERDR_ENV = "1"
require("sidekick-herdr").setup()
pane_list()
running()
local io = discovered()[1]
replies["herdr pane send-text " .. PANE .. " hello"] = ""
replies["herdr pane send-keys " .. PANE .. " Enter"] = ""
io:send("hello")
assert(issued("send-text")[1] == "herdr pane send-text " .. PANE .. " hello", "send must be literal text")
io:submit()
assert(issued("send-keys")[1] == "herdr pane send-keys " .. PANE .. " Enter", "submit must send Enter")

-- 5. tool env is forwarded to the new tab.
reset()
vim.env.HERDR_ENV = "1"
vim.env.HERDR_WORKSPACE_ID = "w1"
Config.cli.tools.pi = { env = { PI_THEME = "dark" } }
require("sidekick-herdr").setup()
local envd = Session.new({ tool = "pi", cwd = CWD })
pane_list()
replies["herdr tab create --workspace w1 --cwd " .. CWD .. " --label " .. envd.sid .. " --no-focus --env PI_THEME=dark"] =
  vim.json.encode({ result = { root_pane = { pane_id = PANE, terminal_id = TERMINAL } } })
replies["herdr pane run " .. PANE .. " exec 'pi'"] = ""
envd:start()
assert(issued("--env PI_THEME=dark")[1] ~= nil, "tool env must reach the tab: " .. vim.inspect(issued()))
Config.cli.tools.pi = {}

-- 6. focus: the attached session's pane, or nothing when none is attached.
reset()
vim.env.HERDR_ENV = "1"
vim.env.HERDR_WORKSPACE_ID = "w1"
local Herdr = require("sidekick-herdr")
Herdr.setup()
assert(Herdr.attached() == nil, "no attached session means nothing to focus")
pane_list()
running()
local attached = discovered()[1]
Session._attached[attached.id] = attached
assert(Herdr.attached():pane_id() == PANE, "must resolve the attached session's pane")
replies["herdr agent focus " .. PANE] = "{}"
assert(Herdr.focus(), "focus must succeed")
assert(issued("agent focus")[1] == "herdr agent focus " .. PANE, "focus must target the pane")

-- 7. sidekick picks the agent itself, so we only need to focus whichever one it
-- picks -- and only when a send keymap asked us to.
reset()
vim.env.HERDR_ENV = "1"
vim.env.HERDR_WORKSPACE_ID = "w1"
Herdr.setup()
pane_list()
assert(Herdr.attached() == nil, "nothing is attached yet")

-- one running agent must not be offered a second one alongside it, or the
-- picker shows "this one" and "a new one" for a single agent
reset()
vim.env.HERDR_ENV = "1"
vim.env.HERDR_WORKSPACE_ID = "w1"
Herdr.setup()
pane_list()
local offered = State.get({ name = Herdr.TOOL })
assert(#offered == 1, "one running agent must be the only candidate, got " .. #offered)
assert(offered[1].session ~= nil, "that candidate must be the running agent")

-- an agent in another directory is still a separate offer
reset()
vim.env.HERDR_ENV = "1"
Herdr.setup()
pane_list({ cwd = "/somewhere/else" })
assert(#State.get({ name = Herdr.TOOL }) == 2, "an agent elsewhere must not suppress a new one")

-- an attach we did not arm must stay silent, so <leader>aa keeps its quiet
Session.attach(discovered()[1])
assert(Herdr.attached() ~= nil, "attach must register the session")
assert(#issued("agent focus") == 0, "an unarmed attach must not focus")

-- a cold send has to ask which agent to use first, so it focuses on the event
reset()
vim.env.HERDR_ENV = "1"
vim.env.HERDR_WORKSPACE_ID = "w1"
Herdr.setup()
pane_list()
replies["herdr agent focus " .. PANE] = "{}"
Herdr.focus_after_send() -- nothing attached yet, so this arms instead
assert(#issued("agent focus") == 0, "focus must wait for the attach")
Session.attach(discovered()[1])
assert(issued("agent focus")[1] == "herdr agent focus " .. PANE, "an armed attach must focus")

-- ...once only, so a later attach is not dragged along
Util.emit("SidekickCliAttach", { id = "again" })
assert(#issued("agent focus") == 1, "focus must be one-shot")

-- a repeat send must focus again even though sidekick attaches nothing new:
-- `Session.attach` returns early for an attached session and emits nothing
assert(Herdr.focus_after_send(), "a repeat send must focus")
assert(#issued("agent focus") == 2, "every send must focus, got " .. #issued("agent focus"))
assert(issued("agent focus")[2] == "herdr agent focus " .. PANE, "focus must still target the pane")

-- nothing anywhere: focus stays quiet rather than nagging
reset()
vim.env.HERDR_ENV = "1"
vim.env.HERDR_WORKSPACE_ID = "w1"
Herdr.setup()
pane_list()
running({ cmd = "/nix/store/xxx/bin/claude" })
assert(Herdr.focus() == false, "focus must fail when there is no agent")
vim.wait(100)
assert(#notes == 0, "focus must not notify, got " .. vim.inspect(notes))

-- 8. the prompt callback gets (preview string, rendered Text[]) and must forward
-- the rendered one: `Cli.send` stringifies a Text[] and nothing else.
reset()
vim.env.HERDR_ENV = "1"
vim.env.HERDR_WORKSPACE_ID = "w1"
Herdr.setup()
pane_list()
running()
replies["herdr agent focus " .. PANE] = "{}"
local rendered = { { { "Can you review my changes?" } } } -- Text[]: lines of chunks
Herdr.prompt_cb()("Can you review my changes?", rendered) -- as prompt.lua:112 calls it
vim.wait(100)
assert(#picks == 0, "one running agent needs no picker, not even for a prompt")
assert(
  issued("send-text")[1] == "herdr pane send-text " .. PANE .. " Can you review my changes?\n",
  "prompt must send the rendered text, got " .. vim.inspect(issued("send-text"))
)
assert(issued("agent focus")[1] == "herdr agent focus " .. PANE, "prompt must focus after sending")

Herdr.prompt_cb()("cancelled", nil) -- the cancel path, prompt.lua:110
vim.wait(100)
assert(#issued("send-text") == 1, "a cancelled prompt must send nothing")
assert(#issued("agent focus") == 1, "a cancelled prompt must not focus")

vim.system, vim.notify, vim.ui.select = system, notify, select
print("sidekick-herdr: all assertions passed")
