return {
  {
    "zbirenbaum/copilot.lua",
    dependencies = { "folke/snacks.nvim" },
    cmd = { "Copilot" },
    event = "InsertEnter",
    opts = {
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
      require("copilot.command").disable()

      local enabled = false
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
  },
}
