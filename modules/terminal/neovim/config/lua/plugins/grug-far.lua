return {
  {
    "MagicDuck/grug-far.nvim",
    cmd = { "GrugFar" },
    ---@module 'grug-far'
    ---@type grug.far.OptionsOverride
    opts = {
      headerMaxWidth = 80,
      transient = true,
      visualSelectionUsage = "auto-detect",
    },
    keys = {
      {
        "<leader>sr",
        function()
          require("grug-far").open({
            startCursorRow = vim.fn.mode() == "v" and 2 or 1,
            prefills = {
              paths = vim.fn.expand("%"),
            },
          })
        end,
        mode = { "n", "x" },
        desc = "Replace in file",
      },
      {
        "<leader>sR",
        function()
          require("grug-far").open({
            startCursorRow = vim.fn.mode() == "v" and 2 or 1,
            prefills = {
              filesFilter = "!.git/",
              flags = "--hidden",
            },
          })
        end,
        mode = { "n", "x" },
        desc = "Replace in files",
      },
    },
  },
}
