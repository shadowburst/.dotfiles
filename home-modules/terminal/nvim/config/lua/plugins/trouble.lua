return {
  {
    "folke/trouble.nvim",
    dependencies = { "nvim-mini/mini.icons" },
    cmd = { "Trouble" },
    ---@module 'trouble'
    ---@type trouble.Config
    opts = {
      auto_close = true,
      auto_preview = true,
      focus = true,
    },
    keys = {
      { "<leader>xx", "<cmd>Trouble diagnostics toggle filter.buf=0<cr>", desc = "Document diagnostics" },
      { "<leader>xX", "<cmd>Trouble diagnostics toggle<cr>", desc = "Workspace diagnostics" },
    },
  },
}
