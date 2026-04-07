vim.pack.add({
  "https://github.com/lambdalisue/suda.vim",
})

Snacks.keymap.set("n", "<leader>fs", "<cmd>SudaWrite<cr>", { desc = "Sudo write this file" })
Snacks.keymap.set("n", "<leader>fS", "<cmd>SudaRead<cr>", { desc = "Sudo this file" })
