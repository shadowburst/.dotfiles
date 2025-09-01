return {
  {
    "NickvanDyke/opencode.nvim",
    dependencies = {
      "folke/snacks.nvim",
      "aserowy/tmux.nvim",
    },
    ---@type opencode.Opts
    opts = {
      auto_reload = true,
      on_opencode_not_found = function()
        local tmux = require("tmux.wrapper.tmux")
        local success = tmux.execute("split-window -h -l 80 opencode")
        if not success then
          vim.notify("Failed to open tmux pane", vim.log.levels.ERROR, { title = "opencode" })
          return false
        end
        return true
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
