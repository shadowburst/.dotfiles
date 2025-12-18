return {
  {
    "folke/sidekick.nvim",
    dependencies = { "folke/snacks.nvim" },
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    ---@module 'sidekick'
    ---@class sidekick.Config
    opts = {
      cli = { enabled = false },
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
            return "<Tab>"
          end
        end,
        expr = true,
        desc = "Next edit suggestion",
      },
    },
  },
}
