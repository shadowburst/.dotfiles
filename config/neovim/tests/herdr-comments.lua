local root = vim.fn.tempname()
vim.fn.mkdir(root .. "/.git", "p")
local state_file = root .. "/comments.json"
vim.g.herdr_comments_state_file = state_file

local function read_state() return vim.json.decode(table.concat(vim.fn.readfile(state_file, "b"), "\n")) end

local file = root .. "/example.lua"
vim.fn.writefile({ "one", "two", "three" }, file)
vim.cmd.edit(vim.fn.fnameescape(file))

local comments = require("herdr-comments")
comments.add(0, 2, 3, "keep this range")
vim.api.nvim_buf_set_lines(0, 0, 0, false, { "zero" })
vim.cmd.write()

local saved = read_state().repos[root][1]
assert(saved.start_line == 3)
assert(saved.end_line == 4)

vim.api.nvim_buf_clear_namespace(0, vim.api.nvim_create_namespace("herdr-comments"), 0, -1)
package.loaded["herdr-comments"] = nil
comments = require("herdr-comments")

local calls = {}
local system = vim.system
vim.env.HERDR_ENV = "1"
vim.env.HERDR_WORKSPACE_ID = "w1"
vim.system = function(command)
  calls[#calls + 1] = command
  return {
    wait = function()
      if command[2] == "agent" and command[3] == "list" then
        return {
          code = 0,
          stdout = vim.json.encode({
            result = {
              agents = {
                {
                  agent = "pi",
                  agent_status = "idle",
                  cwd = root,
                  pane_id = "w1:p1",
                  terminal_title = "reviewer",
                  workspace_id = "w1",
                },
              },
            },
          }),
        }
      end
      return { code = 0, stdout = "" }
    end,
  }
end

comments.submit()

local expected = table.concat({
  "Please address each comment:",
  "example.lua:3-4 — keep this range",
}, "\n")
assert(#calls == 2)
assert(vim.deep_equal(vim.list_slice(calls[2], 1, 4), { "herdr", "agent", "prompt", "w1:p1" }))
assert(calls[2][5] == expected)
assert(read_state().repos[root] == nil)

vim.fn.writefile({
  vim.json.encode({
    version = 1,
    next_id = 43,
    repos = {
      [root] = {
        {
          id = 42,
          path = "neogit:/deadbeef/example.lua",
          start_line = 1,
          end_line = 1,
          text = "saved commit-view comment",
        },
      },
    },
  }),
}, state_file, "b")
vim.api.nvim_buf_clear_namespace(0, vim.api.nvim_create_namespace("herdr-comments"), 0, -1)
package.loaded["herdr-comments"] = nil
comments = require("herdr-comments")
comments.submit()
assert(calls[4][5] == "Please address each comment:\nexample.lua:1 — saved commit-view comment")

vim.cmd.cd(root)
vim.cmd.enew()
vim.api.nvim_buf_set_name(0, "neogit://deadbeef/example.lua")
vim.api.nvim_buf_set_lines(0, 0, -1, false, vim.fn.readfile(file))
vim.bo.modified = false
comments.add(0, 1, 1, "comment from commit view")
assert(read_state().repos[root][1].path == "example.lua", read_state().repos[root][1].path)
vim.cmd.bwipeout({ bang = true })
package.loaded["herdr-comments"] = nil
comments = require("herdr-comments")
local commit_buf = vim.api.nvim_create_buf(false, true)
vim.api.nvim_buf_set_name(commit_buf, "neogit://deadbeef/example.lua")
vim.api.nvim_buf_set_lines(commit_buf, 0, -1, false, vim.fn.readfile(file))
vim.bo[commit_buf].modified = false
vim.api.nvim_win_set_buf(0, commit_buf)
assert(#vim.api.nvim_buf_get_extmarks(commit_buf, vim.api.nvim_create_namespace("herdr-comments"), 0, -1, {}) > 0)
local ui_buf = vim.api.nvim_create_buf(false, true)
vim.api.nvim_win_set_buf(0, ui_buf)
comments.submit()
assert(calls[6][5] == "Please address each comment:\nexample.lua:1 — comment from commit view")

local missing = root .. "/missing.lua"
vim.fn.writefile({ "gone" }, missing)
vim.cmd.edit(vim.fn.fnameescape(missing))
comments.add(0, 1, 1, "stale feedback")
vim.cmd.bwipeout({ bang = true })
vim.fn.delete(missing)
local unopened = root .. "/unopened.lua"
vim.fn.writefile({ "valid" }, unopened)
vim.cmd.edit(vim.fn.fnameescape(unopened))
comments.add(0, 1, 1, "valid feedback")
vim.cmd.bwipeout({ bang = true })
vim.cmd.edit(vim.fn.fnameescape(file))
comments.append()
assert(#calls == 8)
assert(vim.deep_equal(vim.list_slice(calls[8], 1, 4), { "herdr", "pane", "send-text", "w1:p1" }))
assert(calls[8][5] == "Please address each comment:\nunopened.lua:1 — valid feedback")
assert(read_state().repos[root] == nil)

vim.fn.writefile({ "gone again" }, missing)
vim.cmd.edit(vim.fn.fnameescape(missing))
comments.add(0, 1, 1, "only stale feedback")
vim.cmd.bwipeout({ bang = true })
vim.fn.delete(missing)
vim.cmd.edit(vim.fn.fnameescape(file))
comments.submit()
assert(#calls == 8)
assert(read_state().repos[root] == nil)

vim.system = system
vim.api.nvim_del_augroup_by_name("herdr-comments")
vim.fn.delete(root, "rf")
