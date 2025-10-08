return {
  {
    "folke/sidekick.nvim",
    dependencies = { "folke/snacks.nvim" },
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    ---@module 'sidekick'
    ---@class sidekick.Config
    opts = {
      cli = {
        mux = {
          enabled = true,
          create = "split",
          split = { size = 80 },
        },
        tools = {
          opencode = {
            env = { OPENCODE_THEME = "" }, -- No need to change theme, it works in tmux
          },
        },
      },
    },
    keys = {
      {
        "<tab>",
        function()
          if not require("sidekick").nes_jump_or_apply() then
            return "<Tab>"
          end
        end,
        expr = true,
        desc = "Next edit suggestion",
      },
    },
  },
}
