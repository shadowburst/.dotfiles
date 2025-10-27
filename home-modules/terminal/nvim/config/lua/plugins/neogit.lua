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
        group = vim.api.nvim_create_augroup("neogit.reload_log_auto", { clear = true }),
        callback = function(event)
          local buffername = vim.api.nvim_buf_get_name(event.buf)
          if buffername:match("NeogitLogView$") then
            vim.fn.feedkeys("q", "x")
            vim.schedule(
              function() require("neogit").action("log", "log_all_branches", { "--graph", "--decorate" })() end
            )
          end
        end,
      })
      vim.api.nvim_create_autocmd("FileType", {
        group = vim.api.nvim_create_augroup("neogit.reload_log_manual", { clear = true }),
        pattern = {
          "NeogitLogView",
        },
        callback = function(event)
          vim.keymap.set(
            "n",
            "<c-r>",
            function() require("neogit").action("fetch", "fetch_all_remotes", { "--prune" })() end,
            { buffer = event.buf, silent = true }
          )
        end,
      })
    end,
    keys = {
      { "<leader>gg", "<cmd>Neogit<cr>", desc = "Open neogit" },
    },
  },
}
