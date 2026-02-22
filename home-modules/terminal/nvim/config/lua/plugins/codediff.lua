return {
  {
    "esmuellert/codediff.nvim",
    cmd = "CodeDiff",
    opts = {},
    keys = {
      { "<leader>gd", "<cmd>CodeDiff file HEAD<cr>", desc = "Diff current file" },
      { "<leader>gD", "<cmd>CodeDiff<cr>", desc = "Diff project" },
      { "<leader>gf", "<cmd>CodeDiff history %<cr>", desc = "File history" },
      { "<leader>gF", "<cmd>CodeDiff history<cr>", desc = "Commit history" },
    },
  },
}
