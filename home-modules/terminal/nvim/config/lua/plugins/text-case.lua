return {
  {
    "johmsalas/text-case.nvim",
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    opts = {
      prefix = "gt",
    },
  },
}
