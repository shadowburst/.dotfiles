vim.pack.add({
  "https://github.com/folke/sidekick.nvim",
})

require("sidekick").setup({
  nes = { enabled = false },
})

-- Inside a Herdr desktop app terminal (herdr-core sets HC_TERMINAL_ID) agents
-- are hc terminals; inside the Herdr TUI they are panes. Outside Herdr, setup
-- leaves Sidekick's own terminal backend unchanged.
local Cli = require("sidekick.cli")
local Herdr = require(vim.env.HC_TERMINAL_ID and vim.env.HC_TERMINAL_ID ~= "" and "sidekick-hc" or "sidekick-herdr")

Herdr.setup()

-- Lets `{file}` / `{position}` name CodeDiff's revision buffers.
require("sidekick-codediff").setup()

-- Herdr sessions have no Neovim window, so sidekick's own toggle is a
-- no-op once one is running. Toggle attachment ourselves instead.
Snacks.keymap.set("n", "<leader>aa", function()
  if Herdr.attached() then
    Cli.close()
  else
    Cli.toggle({ filter = { cwd = true } })
  end
end, { desc = "Toggle AI" })

Snacks.keymap.set("n", "<leader>as", function() Cli.select() end, { desc = "Select CLI" })
Snacks.keymap.set("n", "<leader>ad", function() Cli.close() end, { desc = "Detach CLI" })

-- Use running agents in this directory: auto-select one, or ask when several match.
---@param opts sidekick.cli.Send
local function send(opts)
  Cli.send(vim.tbl_extend("force", opts, { filter = { cwd = true } }))
  Herdr.focus_after_send()
end

-- `{this}` only ever resolved to `{position}` in a file buffer, and a revision
-- buffer is not one: it would come out as the word "this" plus a selection, and
-- discard the send in normal mode. `{position}` is the same thing where it
-- worked, and goes through the codediff context where it did not.
Snacks.keymap.set({ "n", "x" }, "<leader>at", function() send({ msg = "{position}" }) end, { desc = "Send this" })
Snacks.keymap.set("n", "<leader>af", function() send({ msg = "{file}" }) end, { desc = "Send file" })
Snacks.keymap.set("x", "<leader>av", function() send({ msg = "{selection}" }) end, { desc = "Send selection" })

-- Prompts are picked in Neovim first, so the jump waits for that answer too.
Snacks.keymap.set(
  { "n", "x" },
  "<leader>ap",
  function() Cli.prompt({ cb = Herdr.prompt_cb() }) end,
  { desc = "Send prompt" }
)
