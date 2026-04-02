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
  },
}
