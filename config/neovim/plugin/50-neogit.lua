vim.pack.add({
  "https://github.com/nvim-lua/plenary.nvim",
  "https://github.com/NeogitOrg/neogit",
})

local function run_pi_git_action(skill)
  local neogit = require("neogit")
  local notification_id = "neogit-pi-" .. skill
  local progress = assert(vim.uv.new_timer())
  progress:start(0, 80, vim.schedule_wrap(function()
    Snacks.notify.info("Pi " .. skill .. " running", {
      id = notification_id,
      icon = Snacks.util.spinner(),
      timeout = false,
      title = "Neogit",
    })
  end))

  vim.system({
    "pi",
    "--print",
    "--no-session",
    "--model",
    "openai-codex/gpt-5.6-luna",
    "--thinking",
    "low",
    "Use the `" .. skill .. "` skill.",
  }, { cwd = neogit.status.instance().cwd, text = true }, function(result)
    vim.schedule(function()
      progress:stop()
      progress:close()
      Snacks.notifier.hide(notification_id)
      neogit.refresh()

      local output = vim.trim((result.stdout or "") .. "\n" .. (result.stderr or ""))
      if result.code == 0 then
        if output ~= "" then
          Snacks.notifier.hide(Snacks.notify.info(output, { title = "Pi " .. skill .. " report" }))
        end
        Snacks.notify.info("Pi " .. skill .. " completed", { title = "Neogit" })
      else
        Snacks.notify.error(output ~= "" and output or "Pi exited with code " .. result.code, { title = "Pi " .. skill })
      end
    end)
  end)
end

local function create_pi_popup()
  local popup = require("neogit.lib.popup")
    .builder()
    :name("NeogitPiPopup")
    :new_action_group("Pi")
    :action("c", "Commit", function() run_pi_git_action("commit") end)
    :action("p", "Pull request", function() run_pi_git_action("pr") end)
    :build()

  popup:show()
  return popup
end

require("neogit").setup({
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
    codediff = true,
    snacks = true,
  },
  mappings = {
    status = {
      ["a"] = create_pi_popup,
    },
  },
  signs = {
    -- { CLOSED, OPENED }
    section = { "", "" },
    item = { "", "" },
    hunk = { "", "" },
  },
})

Snacks.keymap.set("n", "<leader>gg", "<cmd>Neogit<cr>", { desc = "Open neogit" })

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
      vim.schedule(function() require("neogit").action("log", "log_all_branches", { "--graph", "--decorate" })() end)
    end
  end,
})

vim.api.nvim_create_autocmd("FileType", {
  group = vim.api.nvim_create_augroup("neogit.hide_statuscolumn", { clear = true }),
  pattern = { "Neogit*" },
  callback = function() vim.b.snacks_statuscolumn_right = false end,
})

vim.api.nvim_create_autocmd("FileType", {
  group = vim.api.nvim_create_augroup("neogit.reload_log_manual", { clear = true }),
  pattern = { "NeogitLogView" },
  callback = function(event)
    Snacks.keymap.set(
      "n",
      "<c-r>",
      require("neogit.lib.async").void(function()
        require("neogit.popups.fetch.actions").fetch_all_remotes({
          get_arguments = function() return { "--prune" } end,
        })
      end),
      { buffer = event.buf, desc = "Fetch all remotes with prune" }
    )
  end,
})
