vim.pack.add({
  "https://github.com/folke/todo-comments.nvim",
})

require("todo-comments").setup({})

Snacks.keymap.set("n", "<leader>st", function() Snacks.picker.todo_comments() end, { desc = "Todo" })
Snacks.keymap.set(
  "n",
  "<leader>sT",
  function() Snacks.picker.todo_comments({ keywords = { "TODO", "FIX", "FIXME" } }) end,
  { desc = "Todo/Fix/Fixme" }
)
