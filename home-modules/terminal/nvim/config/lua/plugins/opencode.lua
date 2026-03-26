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
    config = function()
      ---@type opencode.Opts
      vim.g.opencode_opts = {
        events = {
          permissions = { enabled = false },
        },
      }
    end,
    keys = {
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
