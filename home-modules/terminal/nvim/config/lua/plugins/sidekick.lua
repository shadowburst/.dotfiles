return {
  {
    "folke/sidekick.nvim",
    dependencies = { "folke/snacks.nvim" },
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    ---@module 'sidekick'
    ---@class sidekick.Config
    opts = {
      cli = {
        win = {
          keys = {
            files = { "<c-space>", "files", mode = "nt", desc = "open file picker" },
            hide_n = { "<esc>", "hide", mode = "n", desc = "hide the terminal window" },
            stopinsert = { "<esc>", "stopinsert", mode = "t", desc = "enter normal mode" },
          },
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
      { "<leader>a", "", mode = { "n", "x" }, desc = "+ai" },
      {
        "<leader>aa",
        function()
          if #require("sidekick.status").cli() > 0 then
            require("sidekick.cli").focus()
          else
            require("sidekick.cli").toggle({
              name = "opencode",
              focus = true,
            })
          end
        end,
        mode = { "n", "x" },
        desc = "Ask AI about this",
      },
      {
        "<leader>ap",
        function() require("sidekick.cli").prompt() end,
        mode = { "n", "x" },
        desc = "Sidekick Select Prompt",
      },
      {
        "<leader>as",
        function() require("sidekick.cli").send("{selection}") end,
        mode = { "x" },
        desc = "Sidekick send selection",
      },
    },
  },
}
