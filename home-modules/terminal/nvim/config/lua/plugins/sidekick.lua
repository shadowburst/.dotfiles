return {
  {
    "folke/sidekick.nvim",
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    opts = {},
    keys = {
      { "<leader>a", "", mode = { "n", "v" }, desc = "+ai" },
      {
        "<tab>",
        function()
          if not require("sidekick").nes_jump_or_apply() then
            return "<Tab>"
          end
        end,
        expr = true,
        desc = "Apply next edit suggestion",
      },
      -- Wait for easier integration with with tmux
      -- {
      --   "<leader>aa",
      --   function() require("sidekick.cli").toggle({ name = "opencode", focus = true }) end,
      --   desc = "Sidekick toggle CLI",
      --   mode = { "n", "v" },
      -- },
      -- {
      --   "<leader>ap",
      --   function() require("sidekick.cli").select_prompt() end,
      --   desc = "Sidekick ask prompt",
      --   mode = { "n", "v" },
      -- },
    },
  },
}
