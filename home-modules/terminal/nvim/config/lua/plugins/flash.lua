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
        "<c-space>",
        mode = { "n", "x", "o" },
        function()
          require("flash").treesitter({
            actions = {
              ["<c-space>"] = "next",
              ["<bs>"] = "prev",
            },
          })
        end,
        desc = "Treesitter incremental selection",
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
