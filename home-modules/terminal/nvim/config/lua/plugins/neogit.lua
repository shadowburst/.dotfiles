local function logs() require("neogit").action("log", "log_all_branches", { "--graph", "--decorate" })() end

return {
  {
    "NeogitOrg/neogit",
    commit = "e3c148905c334c886453df1490360ebb1a2ba2ed",
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
          "NeogitCherryPick",
          "NeogitBranchCheckout",
          "NeogitBranchCreated",
          "NeogitBranchDelete",
          "NeogitBranchReset",
          "NeogitBranchRename",
          "NeogitRebase",
          "NeogitReset",
          "NeogitTagCreate",
          "NeogitTagDelete",
          "NeogitCommitComplete",
          "NeogitPushComplete",
          "NeogitPullComplete",
          "NeogitFetchComplete",
        },
        group = group,
        callback = function(event)
          local buffername = vim.api.nvim_buf_get_name(event.buf)
          if buffername:match("NeogitLogView$") then
            vim.fn.feedkeys("q", "x")
            logs()
          end
        end,
      })
    end,
    keys = {
      { "<leader>gg", "<cmd>Neogit<cr>", desc = "Open neogit" },
      {
        "<leader>gl",
        logs,
        desc = "Git logs",
      },
    },
  },
}
