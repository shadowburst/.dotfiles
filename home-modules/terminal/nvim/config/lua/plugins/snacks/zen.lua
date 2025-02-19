return {
  {
    "folke/snacks.nvim",
    ---@module 'snacks'
    ---@type snacks.Config
    opts = {
      styles = {
        zen = {
          width = 0.8,
          backdrop = {
            transparent = false,
            win = {
              wo = { winhighlight = "NormalFloat:Normal" },
            },
          },
        },
      },
      zen = {
        toggles = { dim = false },
        show = { statusline = true },
      },
    },
  },
}
