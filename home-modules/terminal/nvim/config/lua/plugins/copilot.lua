return {
  {
    "zbirenbaum/copilot.lua",
    dependencies = { "folke/snacks.nvim" },
    cmd = { "Copilot" },
    event = "InsertEnter",
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
    },
    config = function(_, opts)
      require("copilot").setup(opts)

      local enabled = true
      Snacks.toggle
        .new({
          name = "copilot",
          get = function() return enabled end,
          set = function(state)
            enabled = state
            if enabled then
              require("copilot.command").enable()
            else
              require("copilot.command").disable()
            end
          end,
        })
        :map("<leader>tc")
    end,
    keys = {
      {
        "<Tab>",
        mode = { "i" },
        function()
          local copilot = require("copilot.suggestion")
          if copilot.is_visible() then
            copilot.accept_word()
          end
        end,
        desc = "Copilot completion",
      },
      {
        "<S-Tab>",
        mode = { "i" },
        function()
          local copilot = require("copilot.suggestion")
          if copilot.is_visible() then
            copilot.accept()
          end
        end,
        desc = "Copilot completion",
      },
    },
  },
}
