return {
  {
    "zbirenbaum/copilot.lua",
    cmd = { "Copilot" },
    lazy = false,
    opts = {
      disable_limit_reached_message = true,
      suggestion = {
        auto_trigger = true,
        trigger_on_accept = false,
      },
      panel = { enabled = false },
      filetypes = {
        markdown = true,
        help = true,
      },
      -- server = {
      --   type = "binary",
      --   custom_server_filepath = "copilot-language-server",
      -- },
    },
    keys = {
      {
        "<tab>",
        function()
          local copilot = require("copilot.suggestion")
          if copilot.is_visible() then
            copilot.accept_word()
          end
        end,
        mode = { "i", "s" },
        desc = "Copilot accept word",
      },
      {
        "<s-tab>",
        function()
          local copilot = require("copilot.suggestion")
          if copilot.is_visible() then
            copilot.accept_line()
          end
        end,
        mode = { "i", "s" },
        desc = "Copilot accept line",
      },
    },
  },
}
