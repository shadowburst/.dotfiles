local mapping = "ga"

return {
  {
    "echasnovski/mini.align",
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    opts = {
      mappings = {
        start = mapping,
        start_with_preview = "",
      },
    },
  },
}
