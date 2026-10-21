vim.pack.add({
  {
    src = "https://github.com/smart-splits-nvim/smart-splits.nvim",
    version = vim.version.range("3.*"),
  },
  "https://github.com/smart-splits-nvim/backend-tmux",
})

local splits = require("smart-splits")
splits.setup({
  mux = { backend = "smart-splits-backend-tmux", warn_if_unusable = false },
})

Snacks.keymap.set("n", "<C-h>", splits.move_cursor_left, { desc = "Move to left split" })
Snacks.keymap.set("n", "<C-j>", splits.move_cursor_down, { desc = "Move to lower split" })
Snacks.keymap.set("n", "<C-k>", splits.move_cursor_up, { desc = "Move to upper split" })
Snacks.keymap.set("n", "<C-l>", splits.move_cursor_right, { desc = "Move to right split" })
Snacks.keymap.set("n", "<M-h>", splits.resize_left, { desc = "Resize split left" })
Snacks.keymap.set("n", "<M-j>", splits.resize_down, { desc = "Resize split down" })
Snacks.keymap.set("n", "<M-k>", splits.resize_up, { desc = "Resize split up" })
Snacks.keymap.set("n", "<M-l>", splits.resize_right, { desc = "Resize split right" })
