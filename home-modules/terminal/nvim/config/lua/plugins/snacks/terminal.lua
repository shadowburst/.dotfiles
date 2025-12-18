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
        "<leader>d",
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
