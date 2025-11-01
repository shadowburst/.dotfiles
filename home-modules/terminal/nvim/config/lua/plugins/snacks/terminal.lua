return {
  {
    "folke/snacks.nvim",
    ---@module 'snacks'
    ---@type snacks.Config
    opts = {
      terminal = {},
    },
    keys = {
      { "<leader>tt", function() Snacks.terminal.toggle() end, desc = "Toggle terminal" },
    },
  },
}
