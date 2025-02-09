return {
  {
    "NeogitOrg/neogit",
    dependencies = {
      "nvim-lua/plenary.nvim",
      "sindrets/diffview.nvim",
    },
    cmd = { "Neogit", "NeogitLogCurrent" },
    ---@module 'neogit'
    ---@type NeogitConfig
    opts = {
      process_spinner = true,
      disable_hint = true,
      graph_style = "kitty",
      remember_settings = false,
      auto_refresh = false,
      commit_editor = {
        kind = "split",
        show_staged_diff = false,
      },
      integrations = { diffview = true },
      signs = {
        -- { CLOSED, OPENED }
        section = { "", "" },
        item = { "", "" },
        hunk = { "", "" },
      },
    },
    keys = {
      { "<leader>gg", "<cmd>Neogit<cr>", desc = "Open neogit" },
      {
        "<leader>gl",
        function() require("neogit").action("log", "log_all_branches", { "--graph", "--decorate" })() end,
        desc = "Git logs",
      },
    },
  },
}
