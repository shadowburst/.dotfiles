return {
  {
    "catppuccin/nvim",
    name = "catppuccin",
    lazy = false,
    priority = 1000,
    ---@module 'catppuccin'
    ---@type CatppuccinOptions
    opts = {
      flavour = "mocha",
      transparent_background = true,
      float = {
        transparent = false,
        solid = false,
      },
      custom_highlights = function(colors)
        return {
          LineNrAbove = { link = "LineNr" },
          LineNrBelow = { link = "LineNr" },
          Pmenu = { bg = colors.mantle, fg = colors.lavender },
          PmenuExtra = { fg = colors.lavender },
          NormalFloat = { bg = colors.mantle },
          FloatBorder = { bg = colors.mantle, fg = colors.lavender },
          Title = { fg = colors.lavender },
          FloatTitle = { bg = colors.mantle },
          -- Blink
          BlinkCmpMenuBorder = { link = "Pmenu" },
          BlinkCmpSignatureHelpBorder = { link = "Pmenu" },
          BlinkCmpDocBorder = { link = "Pmenu" },
          -- Snacks
          SnacksDashboardHeader = { fg = colors.lavender },
          SnacksIndentScope = { fg = colors.lavender },
        }
      end,
      default_integrations = false,
      auto_integrations = true,
    },
    config = function(_, opts)
      require("catppuccin").setup(opts)
      vim.cmd.colorscheme("catppuccin")
    end,
  },
}
