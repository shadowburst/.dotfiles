vim.pack.add({
  {
    src = "https://github.com/catppuccin/nvim",
    name = "catppuccin",
  },
})

require("catppuccin").setup({
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
      -- Lsp
      ["@lsp.type.component"] = { link = "@type" },
    }
  end,
  default_integrations = false,
  auto_integrations = true,
})
vim.cmd.colorscheme("catppuccin-nvim")
