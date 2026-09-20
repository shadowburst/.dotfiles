local root = vim.fn.tempname()
vim.fn.mkdir(root .. "/.git", "p")
local file = root .. "/example.lua"
vim.fn.writefile({ "one", "two", "three" }, file)
vim.cmd.edit(vim.fn.fnameescape(file))

local comments = require("herdr-comments")
comments.add(0, 2, 3, "keep this range")
vim.api.nvim_buf_set_lines(0, 0, 0, false, { "zero" })
vim.cmd.write()

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

comments.add(0, 1, 1, "check zero")
comments.append()
assert(#calls == 4)
assert(vim.deep_equal(vim.list_slice(calls[4], 1, 4), { "herdr", "pane", "send-text", "w1:p1" }))
assert(calls[4][5] == "Please address each comment:\nexample.lua:1 — check zero")
comments.submit()
assert(#calls == 4)

vim.system = system
vim.fn.delete(root, "rf")
