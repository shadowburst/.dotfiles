return {
  {
    "NickvanDyke/opencode.nvim",
    dependencies = {
      "folke/snacks.nvim",
    },
    ---@type opencode.Opts
    opts = {
      auto_reload = true,
      on_opencode_not_found = function()
        vim.notify("Opencode instance not found", vim.log.levels.WARN, { title = "opencode" })
        return false
      end,
    },
    keys = {
      {
        "<leader>oa",
        function() require("opencode").ask("@cursor: ") end,
        desc = "Ask opencode about this",
        mode = "n",
      },
      {
        "<leader>oa",
        function() require("opencode").ask("@selection: ") end,
        desc = "Ask opencode about selection",
        mode = "v",
      },
      {
        "<leader>oc",
        function() require("opencode").prompt("Add documentation comments for @selection") end,
        desc = "Document selection",
        mode = "v",
      },
      {
        "<leader>od",
        function() require("opencode").prompt("Fix this @diagnostic") end,
        desc = "Fix errors",
      },
      {
        "<leader>oD",
        function() require("opencode").prompt("Fix these @diagnostics") end,
        desc = "Fix errors",
      },
      {
        "<leader>oo",
        function() require("opencode").ask() end,
        desc = "Ask opencode",
      },
      {
        "<leader>or",
        function() require("opencode").prompt("Review @buffer for correctness and readability") end,
        desc = "Review file",
      },
    },
  },
}
