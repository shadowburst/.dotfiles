return {
  {
    "folke/snacks.nvim",
    keys = {
      {
        "<leader>bc",
        function() Snacks.bufdelete() end,
        desc = "Delete buffer",
      },
      {
        "<leader>bo",
        function() Snacks.bufdelete.other() end,
        desc = "Close other buffers",
      },
    },
  },
}
