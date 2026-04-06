return {
  {
    "nvim-mini/mini.ai",
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    opts = { n_lines = 500 },
  },
}
