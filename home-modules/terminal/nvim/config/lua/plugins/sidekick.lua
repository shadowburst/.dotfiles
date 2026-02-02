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
            files = { "@", "files", mode = "nt", desc = "open file picker" },
          },
        },
        tools = {
          opencode = {
            env = { OPENCODE_THEME = "" }, -- No need to change theme, it works in tmux
          },
        },
      },
      nes = {
        enabled = function(buf)
          return vim.g.sidekick_nes ~= false and vim.b.sidekick_nes ~= false and vim.fn.mode() ~= "s"
        end,
      },
    },
    keys = {
      {
        "<tab>",
        function()
          if not require("sidekick").nes_jump_or_apply() then
            return "<cmd>Sidekick nes update<cr><tab>"
          end
        end,
        expr = true,
        desc = "Next edit suggestion",
      },
      {
        "<leader>oo",
        function()
          require("sidekick.cli").toggle({
            name = "opencode",
            focus = true,
          })
        end,
        mode = { "n", "x" },
        desc = "Toggle opencode",
      },
      {
        "<leader>op",
        function() require("sidekick.cli").prompt() end,
        mode = { "n", "x" },
        desc = "Prompt opencode",
      },
      {
        "<leader>os",
        function() require("sidekick.cli").send("{selection}") end,
        mode = { "x" },
        desc = "Send selection to opencode",
      },
    },
  },
}
