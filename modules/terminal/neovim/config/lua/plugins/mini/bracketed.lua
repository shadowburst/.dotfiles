return {
  {
    "nvim-mini/mini.bracketed",
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    opts = {
      indent = { suffix = "" },
      undo = { suffix = "" },
    },
  },
}
