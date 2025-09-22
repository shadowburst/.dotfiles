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
      integrations = {
        diffview = true,
        snacks = true,
      },
      signs = {
        -- { CLOSED, OPENED }
        section = { "", "" },
        item = { "", "" },
        hunk = { "", "" },
      },
    },
    init = function()
      local group = vim.api.nvim_create_augroup("custom_neogit", { clear = true })
      vim.api.nvim_create_autocmd("User", {
        pattern = {
          "NeogitBranchCheckout",
          "NeogitBranchCreated",
          "NeogitBranchDelete",
          "NeogitBranchRename",
          "NeogitBranchReset",
          "NeogitCherryPick",
          "NeogitCommitComplete",
          "NeogitFetchComplete",
          "NeogitMerge",
          "NeogitPullComplete",
          "NeogitPushComplete",
          "NeogitRebase",
          "NeogitReset",
          "NeogitTagCreate",
          "NeogitTagDelete",
        },
        group = group,
        callback = function(event)
          local buffername = vim.api.nvim_buf_get_name(event.buf)
          if buffername:match("NeogitLogView$") then
            vim.fn.feedkeys("q", "x")
            require("neogit").action("log", "log_all_branches", { "--graph", "--decorate" })()
          end
        end,
      })
    end,
    keys = {
      { "<leader>gg", "<cmd>Neogit<cr>", desc = "Open neogit" },
    },
  },
}
