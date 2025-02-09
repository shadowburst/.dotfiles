return {
  {
    "folke/noice.nvim",
    dependencies = {
      "MunifTanjim/nui.nvim",
      "echasnovski/mini.icons",
    },
    event = { "VeryLazy" },
    cmd = { "Noice" },
    ---@module 'noice'
    ---@type NoiceConfig
    opts = {
      presets = {
        bottom_search = false, -- use a classic bottom cmdline for search
        command_palette = true, -- position the cmdline and popupmenu together
        long_message_to_split = true, -- long messages will be sent to a split
        inc_rename = true, -- enables an input dialog for inc-rename.nvim
        lsp_doc_border = true, -- add a border to hover docs and signature help
      },
      lsp = {
        hover = { view = "hover" },
        signature = { enabled = false },
      },
      views = {
        hover = {
          border = {
            style = "rounded",
            padding = { 0, 1 },
          },
          position = {
            row = 2,
            col = 2,
          },
        },
      },
    },
    keys = {
      { "<leader>nd", "<cmd>Noice dismiss<cr>", desc = "Dismiss all" },
    },
  },
}
