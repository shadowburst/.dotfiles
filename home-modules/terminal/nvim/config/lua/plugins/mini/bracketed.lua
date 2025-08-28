return {
  {
    "nvim-mini/mini.bracketed",
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    opts = {
      undo = { suffix = "" },
    },
  },
}
