return {
  {
    "MagicDuck/grug-far.nvim",
    cmd = { "GrugFar" },
    ---@module 'grug-far'
    ---@type grug.far.OptionsOverride
    opts = {
      startCursorRow = 2,
      headerMaxWidth = 80,
      transient = true,
    },
    keys = {
      {
        "<leader>sr",
        function()
          require("grug-far").open({
            prefills = {
              search = vim.fn.expand("<cword>"),
              paths = vim.fn.expand("%"),
            },
          })
        end,
        desc = "Replace <cword> in file",
      },
      {
        "<leader>sr",
        function()
          require("grug-far").open({
            startCursorRow = 1,
            visualSelectionUsage = "operate-within-range",
          })
        end,
        mode = { "x" },
        desc = "Replace in selection",
      },
      {
        "<leader>sR",
        function()
          require("grug-far").open({
            prefills = {
              search = vim.fn.expand("<cword>"),
              filesFilter = "!.git/",
              flags = "--hidden",
            },
          })
        end,
        desc = "Replace <cword> in files",
      },
      {
        "<leader>sR",
        function()
          require("grug-far").open({
            prefills = {
              filesFilter = "!.git/",
              flags = "--hidden",
            },
          })
        end,
        mode = { "x" },
        desc = "Replace selection in files",
      },
    },
  },
}
