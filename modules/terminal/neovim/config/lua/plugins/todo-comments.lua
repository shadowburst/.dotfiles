return {
  {
    "folke/todo-comments.nvim",
    dependencies = { "folke/snacks.nvim" },
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    ---@module 'todo-comments'
    ---@type TodoConfig
    opts = {},
    keys = {
      {
        "<leader>st",
        function() Snacks.picker.todo_comments() end,
        desc = "Todo",
      },
      {
        "<leader>sT",
        function() Snacks.picker.todo_comments({ keywords = { "TODO", "FIX", "FIXME" } }) end,
        desc = "Todo/Fix/Fixme",
      },
    },
  },
}
