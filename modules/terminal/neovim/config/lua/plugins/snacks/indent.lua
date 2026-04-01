return {
  {
    "folke/snacks.nvim",
    ---@module 'snacks'
    ---@type snacks.Config
    opts = {
      indent = {
        indent = { char = " " },
        chunk = {
          enabled = true,
          char = {
            corner_top = "╭",
            corner_bottom = "╰",
            arrow = "─",
          },
        },
      },
    },
  },
}
