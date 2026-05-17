vim.pack.add({
  "https://github.com/nvim-treesitter/nvim-treesitter-context",
})

require("treesitter-context").setup({
  max_lines = 4,
  mode = "topline",
  multiwindow = true,
})
