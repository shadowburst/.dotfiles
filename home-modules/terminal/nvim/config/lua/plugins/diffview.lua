return {
  {
    "sindrets/diffview.nvim",
    opts = function()
      local actions = require("diffview.actions")

      return {
        keymaps = {
          file_panel = {
            { "n", "q", "<cmd>DiffviewClose<cr>", { desc = "Close Diffview" } },
          },
          file_history_panel = {
            { "n", "q", "<cmd>DiffviewClose<cr>", { desc = "Close Diffview" } },
            { "n", "<tab>", false },
            { "n", "<s-tab>", false },
            { "n", "j", actions.select_next_entry, { desc = "Open the diff for the next file" } },
            { "n", "k", actions.select_prev_entry, { desc = "Open the diff for the previous file" } },
            { "n", "<c-b>", false },
            { "n", "<c-f>", false },
            { "n", "<c-u>", actions.scroll_view(-0.25), { desc = "Scroll the view up" } },
            { "n", "<c-d>", actions.scroll_view(0.25), { desc = "Scroll the view down" } },
          },
        },
      }
    end,
    keys = {
      { "<leader>gd", "<cmd>DiffviewOpen -- %:p <cr>", desc = "Diff this buffer" },
      { "<leader>gD", "<cmd>DiffviewOpen<cr>", desc = "Diff this repository" },
      { "<leader>gf", "<cmd>DiffviewFileHistory %<cr>", desc = "File history" },
    },
  },
}
