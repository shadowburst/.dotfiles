return {
  {
    "NickvanDyke/opencode.nvim",
    dependencies = {
      "folke/sidekick.nvim",
      "folke/snacks.nvim",
    },
    ---@module 'opencode'
    ---@type opencode.Opts
    opts = {
      auto_reload = true,
      on_opencode_not_found = function() require("sidekick.cli").toggle("opencode") end,
    },
    config = function(_, opts) vim.g.opencode_opts = opts end,
    keys = {
      { "<leader>a", "", mode = { "n", "x" }, desc = "+ai" },
      {
        "<leader>aa",
        function() require("opencode").ask("@this: ", { submit = true }) end,
        mode = { "n", "x" },
        desc = "Ask AI about this",
      },
      {
        "<leader>ac",
        function() require("opencode").prompt("Add documentation comments for @selection", { submit = true }) end,
        desc = "Document selection",
        mode = "v",
      },
      {
        "<leader>ad",
        function() require("opencode").prompt("Fix this @diagnostic", { submit = true }) end,
        desc = "Fix line diagnostic",
      },
      {
        "<leader>ap",
        function() require("opencode").ask() end,
        mode = { "n", "x" },
        desc = "Push to AI prompt",
      },
      {
        "<leader>as",
        function() require("opencode").prompt("", { submit = true }) end,
        mode = { "n", "x" },
        desc = "Submit AI prompt",
      },
      {
        "<leader>ar",
        function() require("opencode").prompt("Review @buffer for correctness and readability", { submit = true }) end,
        desc = "Review file",
      },
    },
  },
}
