return {
  {
    "folke/snacks.nvim",
    ---@module 'snacks'
    ---@type snacks.Config
    opts = {
      terminal = {},
    },
    keys = {
      {
        "<leader>db",
        function()
          Snacks.terminal.toggle({ "sqlit" }, {
            win = {
              width = 0,
              height = 0,
            },
          })
        end,
        desc = "Toggle sqlit",
      },
      {
        "<leader>dd",
        function()
          Snacks.terminal.toggle({ "lazydocker" }, {
            win = {
              width = 0,
              height = 0,
            },
          })
        end,
        desc = "Toggle lazydocker",
      },
      { "<leader>tt", function() Snacks.terminal.toggle() end, desc = "Toggle terminal" },
    },
  },
}
