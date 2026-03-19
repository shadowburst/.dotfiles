return {
  {
    "NickvanDyke/opencode.nvim",
    dependencies = {
      {
        ---@module "snacks"
        "folke/snacks.nvim",
        opts = {
          input = {},
          picker = {
            actions = {
              opencode_send = function(...) return require("opencode").snacks_picker_send(...) end,
            },
            win = {
              input = {
                keys = {
                  ["<C-o>"] = { "opencode_send", mode = { "n", "i" } },
                },
              },
            },
          },
        },
      },
    },
    keys = {
      {
        "<leader>on",
        function() require("opencode").command("session.new") end,
        mode = { "n", "x" },
        desc = "New opencode session",
      },
      {
        "<leader>oo",
        function() require("opencode").ask("@this ", { submit = true }) end,
        mode = { "n", "x" },
        desc = "Ask opencode for this",
      },
      {
        "<leader>op",
        function() require("opencode").select() end,
        desc = "Execute opencode action",
      },
      {
        "<leader>or",
        function() require("opencode").ask("@review ", { submit = true, clear = true }) end,
        desc = "Review with opencode",
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
