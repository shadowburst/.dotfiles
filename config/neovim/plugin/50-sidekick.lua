vim.pack.add({
  "https://github.com/folke/sidekick.nvim",
})

require("sidekick").setup({
  nes = { enabled = false },
})

-- Registers the herdr session backend and points sidekick's multiplexer at it.
-- Outside herdr this is a no-op and sidekick falls back to its own terminal backend.
local Cli = require("sidekick.cli")
local Herdr = require("sidekick-herdr")

Herdr.setup()

-- `pane run` sessions have no Neovim window, so sidekick's own toggle is a
-- no-op once one is running. Toggle attachment ourselves instead.
Snacks.keymap.set("n", "<leader>aa", function()
  if Herdr.attached() then
    Cli.close()
  else
    Cli.toggle({ name = Herdr.TOOL })
  end
end, { desc = "Toggle AI" })

Snacks.keymap.set("n", "<leader>as", function() Cli.select() end, { desc = "Select CLI" })
Snacks.keymap.set("n", "<leader>ad", function() Cli.close() end, { desc = "Detach CLI" })

-- sidekick already picks the agent: it auto-selects when exactly one matches the
-- filter and shows its own picker when several do. These only narrow it to pi and
-- ask to be taken to whichever agent receives the send.
---@param opts sidekick.cli.Send
local function send(opts)
  Cli.send(vim.tbl_extend("force", opts, { filter = { name = Herdr.TOOL } }))
  Herdr.focus_after_send()
end

Snacks.keymap.set({ "n", "x" }, "<leader>at", function() send({ msg = "{this}" }) end, { desc = "Send this" })
Snacks.keymap.set("n", "<leader>af", function() send({ msg = "{file}" }) end, { desc = "Send file" })
Snacks.keymap.set("x", "<leader>av", function() send({ msg = "{selection}" }) end, { desc = "Send selection" })

-- Prompts are picked in Neovim first, so the jump waits for that answer too.
Snacks.keymap.set(
  { "n", "x" },
  "<leader>ap",
  function() Cli.prompt({ cb = Herdr.prompt_cb() }) end,
  { desc = "Send prompt" }
)
