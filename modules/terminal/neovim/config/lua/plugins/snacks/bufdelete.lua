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
        function()
          Snacks.bufdelete({ filter = function(buf) return #vim.fn.win_findbuf(buf) == 0 end })
        end,
        desc = "Close other buffers",
      },
    },
  },
}
