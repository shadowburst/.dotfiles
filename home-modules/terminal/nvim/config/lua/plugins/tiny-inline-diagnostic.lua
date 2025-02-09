return {
  {
    "rachartier/tiny-inline-diagnostic.nvim",
    event = { "VeryLazy" },
    priority = 1000,
    opts = {
      options = {
        multilines = true,
        show_all_diags_on_cursorline = true,
      },
      signs = {
        left = "",
        right = "",
      },
    },
    init = function() vim.diagnostic.config({ virtual_text = false }) end,
  },
}
