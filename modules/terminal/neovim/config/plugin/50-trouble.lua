vim.pack.add({
  "https://github.com/folke/trouble.nvim",
})

require("trouble").setup({
  auto_close = true,
  auto_preview = true,
  focus = true,
})

Snacks.keymap.set(
  "n",
  "<leader>xx",
  "<cmd>Trouble diagnostics toggle filter.buf=0<cr>",
  { desc = "Document diagnostics" }
)
Snacks.keymap.set("n", "<leader>xX", "<cmd>Trouble diagnostics toggle<cr>", { desc = "Workspace diagnostics" })
