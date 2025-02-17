return {
  {
    "zbirenbaum/copilot.lua",
    cmd = { "Copilot" },
    opts = {
      suggestion = {
        auto_trigger = false,
        keymap = {
          accept = false,
          next = false,
          prev = false,
        },
      },
      panel = { enabled = false },
      filetypes = {
        markdown = true,
        help = true,
      },
    },
    keys = {
      {
        "<C-Space>",
        mode = { "i" },
        function()
          local copilot = require("copilot.suggestion")
          if copilot.is_visible() then
            copilot.accept()
          else
            copilot.next()
          end
        end,
        desc = "Copilot completion",
      },
    },
  },
}
