local mapping = "ga"

return {
  {
    "nvim-mini/mini.align",
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    opts = {
      mappings = {
        start = mapping,
        start_with_preview = "",
      },
    },
  },
}
