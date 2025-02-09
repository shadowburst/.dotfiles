return {
  {
    "folke/flash.nvim",
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    ---@module 'flash'
    ---@type Flash.Config
    opts = {
      modes = {
        search = {
          enabled = true,
          highlight = { backdrop = true },
          search = {
            wrap = false,
            multi_window = false,
          },
        },
      },
    },
    keys = {
      {
        "s",
        mode = "o",
        function() require("flash").treesitter() end,
        desc = "Treesitter",
      },
      {
        "r",
        mode = "o",
        function() require("flash").remote() end,
        desc = "Remote",
      },
    },
  },
}
