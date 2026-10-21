vim.pack.add({
  "https://github.com/folke/sidekick.nvim",
})

require("sidekick").setup({
  nes = { enabled = false },
  cli = { mux = { enabled = true, backend = "tmux" } },
})

local Cli = require("sidekick.cli")
-- `cwd` also excludes new-session offers: workmux starts the project Pi agent.
local filter = { name = vim.env.AGENT or "pi", cwd = true }

-- Lets `{file}` / `{position}` name CodeDiff's revision buffers.
require("sidekick-codediff").setup()

-- Native toggle only attaches external tmux agents; it never kills their pane.
Snacks.keymap.set("n", "<leader>aa", function() Cli.toggle({ filter = filter }) end, { desc = "Toggle AI" })
Snacks.keymap.set("n", "<leader>as", function() Cli.select({ filter = filter }) end, { desc = "Select CLI" })
Snacks.keymap.set("n", "<leader>ad", function() Cli.close({ filter = filter }) end, { desc = "Detach CLI" })

---@param opts sidekick.cli.Send
local function send(opts) Cli.send(vim.tbl_extend("force", opts, { filter = filter, focus = true })) end

-- `{position}` also works in CodeDiff revision buffers, unlike `{this}`.
Snacks.keymap.set({ "n", "x" }, "<leader>at", function() send({ msg = "{position}" }) end, { desc = "Send this" })
Snacks.keymap.set("n", "<leader>af", function() send({ msg = "{file}" }) end, { desc = "Send file" })
Snacks.keymap.set("x", "<leader>av", function() send({ msg = "{selection}" }) end, { desc = "Send selection" })

Snacks.keymap.set({ "n", "x" }, "<leader>ap", function()
  Cli.prompt({
    cb = function(_, text)
      if text then
        send({ text = text })
      end
    end,
  })
end, { desc = "Send prompt" })
