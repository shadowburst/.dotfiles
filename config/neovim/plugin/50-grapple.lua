vim.pack.add({
  "https://github.com/cbochs/grapple.nvim",
})

require("grapple").setup({
  scope = "git_branch",
  win_opts = { border = vim.g.border },
})

vim.keymap.set("n", "<leader>m", "<cmd>Grapple toggle_tags<cr>", { desc = "Grapple tags window" })
vim.keymap.set("n", "m", "<cmd>Grapple toggle<cr>", { desc = "Grapple toggle tag" })
vim.keymap.set("n", "<s-h>", "<cmd>Grapple cycle_tags prev<cr>", { desc = "Grapple cycle previous tag" })
vim.keymap.set("n", "<s-l>", "<cmd>Grapple cycle_tags next<cr>", { desc = "Grapple cycle next tag" })
