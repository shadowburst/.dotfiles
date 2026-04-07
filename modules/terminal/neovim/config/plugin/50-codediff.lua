vim.pack.add({
  "https://github.com/esmuellert/codediff.nvim",
})

require("codediff").setup({
  diff = { conflict_result_height = 50 },
})

Snacks.keymap.set("n", "<leader>gd", "<cmd>CodeDiff file HEAD<cr>", { desc = "Diff current file" })
Snacks.keymap.set("n", "<leader>gD", "<cmd>CodeDiff<cr>", { desc = "Diff project" })
Snacks.keymap.set("n", "<leader>gf", "<cmd>CodeDiff history %<cr>", { desc = "File history" })
Snacks.keymap.set("n", "<leader>gF", "<cmd>CodeDiff history<cr>", { desc = "Commit history" })
