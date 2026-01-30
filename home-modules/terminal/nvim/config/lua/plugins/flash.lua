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
        "sj",
        mode = { "n" },
        function()
          require("flash").jump({
            search = {
              max_length = 2,
            },
          })
        end,
        desc = "Flash jump",
      },
      {
        "s",
        mode = { "o" },
        function()
          require("flash").treesitter({
            actions = {
              ["s"] = "next",
              ["S"] = "prev",
            },
          })
        end,
        desc = "Treesitter incremental selection",
      },
      {
        "r",
        mode = { "o" },
        function() require("flash").remote() end,
        desc = "Flash remote",
      },
    },
  },
}
