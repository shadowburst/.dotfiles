return {
  {
    "NickvanDyke/opencode.nvim",
    dependencies = {
      "folke/snacks.nvim",
    },
    config = function()
      ---@type opencode.Opts
      vim.g.opencode_opts = {
        provider = {
          enabled = "tmux",
          tmux = {
            options = "-h -l 80",
          },
        },
      }
    end,
    keys = {
      {
        "<leader>oo",
        function() require("opencode").toggle() end,
        mode = { "n", "x" },
        desc = "Toggle opencode",
      },
      {
        "<leader>op",
        function() require("opencode").select() end,
        desc = "Execute opencode action",
      },
      {
        "go",
        function() return require("opencode").operator("@this ") end,
        mode = { "n", "x" },
        expr = true,
        desc = "Add range to opencode",
      },
      {
        "goo",
        function() return require("opencode").operator("@this ") .. "_" end,
        expr = true,
        desc = "Add line to opencode",
      },
    },
  },
}
