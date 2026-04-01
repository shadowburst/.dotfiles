return {
  {
    "lambdalisue/suda.vim",
    cmd = { "SudaRead", "SudaWrite" },
    keys = {
      { "<leader>fs", "<cmd>SudaWrite<cr>", desc = "Sudo write this file" },
      { "<leader>fS", "<cmd>SudaRead<cr>", desc = "Sudo this file" },
    },
  },
}
