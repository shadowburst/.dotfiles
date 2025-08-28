return {
  {
    "nvim-mini/mini.diff",
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    opts = {
      view = {
        style = "sign",
        signs = {
          add = "▎",
          change = "▎",
          delete = "",
        },
      },
      mappings = {
        apply = "",
        reset = "",
      },
    },
    keys = {
      {
        "<leader>gp",
        function() require("mini.diff").toggle_overlay(0) end,
        desc = "Toggle mini.diff overlay",
      },
      {
        "<leader>gr",
        function() return require("mini.diff").operator("reset") .. "gh" end,
        remap = true,
        expr = true,
        desc = "Reset hunk",
      },
    },
  },
}
