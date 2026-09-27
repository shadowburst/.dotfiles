-- Run: nvim -u NONE -l config/neovim/tests/sidekick-codediff.lua
vim.opt.runtimepath:prepend(vim.fn.stdpath("config"))
vim.cmd.packadd("sidekick.nvim")
vim.cmd.packadd("codediff.nvim")

require("sidekick").setup({ nes = { enabled = false } })
require("sidekick-codediff").setup()

local Cli = require("sidekick.cli")
local Config = require("sidekick.config")
local Context = require("sidekick.cli.context")
local Text = require("sidekick.text")
local VirtualFile = require("codediff.core.virtual_file")

local ROOT = vim.fs.normalize((vim.fn.fnamemodify(vim.fn.tempname(), ":p"):gsub("/$", "")))
vim.fn.mkdir(ROOT .. "/lua", "p")
vim.cmd.cd(ROOT) -- so sidekick renders the path relative to the repo root

--- A revision buffer, built the way CodeDiff builds them: a scratch buffer
--- renamed to the virtual URL, so no git repo and no BufReadCmd are needed.
---@param revision string
---@return integer
local function revision_buf(revision)
  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_name(buf, VirtualFile.create_url(ROOT, revision, "lua/foo.lua"))
  vim.bo[buf].buftype = "nowrite"
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, { "local a = 1", "local b = 2", "local c = 3" })
  vim.api.nvim_win_set_buf(0, buf)
  return buf
end

---@param msg string
---@return string
local function render(msg) return (Cli.render({ msg = msg })) end

-- 1. a file is a file: no label, and the position carries the cursor.
local file = vim.fn.fnamemodify(ROOT .. "/lua/foo.lua", ":p")
vim.fn.writefile({ "local a = 1", "local b = 2", "local c = 3" }, file)
vim.cmd.edit(file)
vim.api.nvim_win_set_cursor(0, { 2, 2 })
assert(render("{file}") == "@lua/foo.lua", "a real file must be untouched, got " .. render("{file}"))
-- `L`/`C` are sidekick's own markers, carried as text so the prompt can
-- highlight them; the agent receives them verbatim.
assert(
  render("{position}") == "@lua/foo.lua :L2:C4",
  "a real file position must be untouched, got " .. render("{position}")
)

-- 2. every revision label but HEAD, and HEAD itself unlabelled.
for revision, expected in pairs({
  HEAD = "@lua/foo.lua",
  abc123 = "@lua/foo.lua abc123",
  ["abc123^"] = "@lua/foo.lua abc123",
  [":0"] = "@lua/foo.lua :0",
  main = "@lua/foo.lua main",
}) do
  local buf = revision_buf(revision)
  assert(render("{file}") == expected, ("{file} at %s"):format(revision))
  vim.api.nvim_buf_delete(buf, { force = true }) -- names are unique, so let the next one have it
end

-- 3. <leader>at names the buffer's line, which is what the send keymap asks for.
revision_buf("abc123")
vim.api.nvim_win_set_cursor(0, { 2, 2 })
assert(
  render("{position}") == "@lua/foo.lua abc123 :L2:C4",
  "position must carry the cursor, got " .. render("{position}")
)

-- 4. a visual <leader>at keeps its range: the name override must not drop
-- ctx.range, or the selection silently collapses to one position.
local ctx = Context.ctx()
ctx.range = { from = { 2, 0 }, to = { 4, 0 }, kind = "line" }
assert(
  Text.to_string(Config.cli.context.position(ctx)) == "@lua/foo.lua abc123 :L2-L4",
  "a linewise range must survive, got " .. Text.to_string(Config.cli.context.position(ctx))
)
ctx.range = { from = { 2, 3 }, to = { 2, 8 }, kind = "char" }
assert(
  Text.to_string(Config.cli.context.position(ctx)) == "@lua/foo.lua abc123 :L2:C4-C9",
  "a charwise range must survive, got " .. Text.to_string(Config.cli.context.position(ctx))
)

-- 5. only rewrite what parses: a URL we cannot read falls through to sidekick
-- and gets whatever its own relpath pass makes of the name, rather than a path
-- we made up.
local broken = vim.api.nvim_create_buf(false, true)
vim.api.nvim_buf_set_name(broken, "codediff:///nowhere///")
vim.api.nvim_win_set_buf(0, broken)
local raw = vim.fs.normalize(vim.api.nvim_buf_get_name(broken))
assert(render("{file}") == "@" .. raw, "an unparseable URL must be left alone, got " .. render("{file}"))

print("sidekick-codediff: all assertions passed")
