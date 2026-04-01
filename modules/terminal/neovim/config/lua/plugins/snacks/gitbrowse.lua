return {
  {
    "folke/snacks.nvim",
    ---@module 'snacks'
    ---@type snacks.Config
    opts = {
      gitbrowse = {},
    },
    keys = {
      {
        "<leader>go",
        function() Snacks.gitbrowse() end,
        desc = "Open repo",
      },
    },
  },
}
