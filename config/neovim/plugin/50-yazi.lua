vim.pack.add({
  "https://github.com/nvim-lua/plenary.nvim",
  "https://github.com/mikavilpas/yazi.nvim",
})

vim.g.loaded_netrwPlugin = 1

require("yazi").setup({
  open_for_directories = true,
  highlight_hovered_buffers_in_same_directory = false,
  floating_window_scaling_factor = 1,
  yazi_floating_window_border = "none",
  integrations = {
    grep_in_directory = "snacks.picker",
    grep_in_selected_files = "snacks.picker",
  },
  keymaps = {
    grep_in_directory = "<c-g>",
    replace_in_directory = "<c-r>",
  },
})

Snacks.keymap.set("n", "<leader>e", "<cmd>Yazi<cr>", { desc = "File manager" })
