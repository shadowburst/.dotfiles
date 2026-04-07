vim.pack.add({
  "https://github.com/MunifTanjim/nui.nvim",
  "https://github.com/folke/noice.nvim",
})

require("noice").setup({
  presets = {
    bottom_search = false, -- use a classic bottom cmdline for search
    command_palette = true, -- position the cmdline and popupmenu together
    long_message_to_split = true, -- long messages will be sent to a split
    inc_rename = true, -- enables an input dialog for inc-rename.nvim
    lsp_doc_border = true, -- add a border to hover docs and signature help
  },
  lsp = {
    signature = { enabled = false },
    hover = {
      view = "hover",
      silent = true,
    },
  },
  views = {
    hover = {
      border = {
        style = vim.g.border,
        padding = { 0, 1 },
      },
      position = {
        row = 2,
        col = 2,
      },
    },
  },
})

Snacks.keymap.set("n", "<leader>nd", "<cmd>Noice dismiss<cr>", { desc = "Dismiss all" })
