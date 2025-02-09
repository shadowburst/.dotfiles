return {
  {
    "folke/snacks.nvim",
    ---@module 'snacks'
    ---@type snacks.Config
    opts = { words = {} },
    keys = {
      {
        "[[",
        function() Snacks.words.jump(-vim.v.count1) end,
        desc = "Prev reference",
      },
      {
        "]]",
        function() Snacks.words.jump(vim.v.count1) end,
        desc = "Next reference",
      },
    },
  },
}
