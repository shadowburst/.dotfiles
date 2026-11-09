vim.pack.add({
  "https://github.com/nvim-lua/plenary.nvim",
  "https://github.com/NeogitOrg/neogit",
})

-- Shows a spinner until the returned function is called.
local function progress(title)
  local id = "neogit-ai-" .. title
  local timer = assert(vim.uv.new_timer())
  timer:start(
    0,
    80,
    vim.schedule_wrap(
      function()
        Snacks.notify.info(title .. " running", {
          id = id,
          icon = Snacks.util.spinner(),
          timeout = false,
          title = "Neogit",
        })
      end
    )
  )
  return function()
    timer:stop()
    timer:close()
    Snacks.notifier.hide(id)
  end
end

local function run_pi_git_action(skill)
  local neogit = require("neogit")
  local done = progress("Pi " .. skill)

  vim.system({
    "pi",
    "--print",
    "--no-session",
    "--model",
    "openai-codex/gpt-6-luna",
    "--thinking",
    "low",
    "Use the `" .. skill .. "` skill.",
  }, { cwd = neogit.status.instance().cwd, text = true }, function(result)
    vim.schedule(function()
      done()
      neogit.refresh()

      local output = vim.trim((result.stdout or "") .. "\n" .. (result.stderr or ""))
      if result.code == 0 then
        if output ~= "" then
          Snacks.notifier.hide(Snacks.notify.info(output, { title = "Pi " .. skill .. " report" }))
        end
        Snacks.notify.info("Pi " .. skill .. " completed", { title = "Neogit" })
      else
        Snacks.notify.error(
          output ~= "" and output or "Pi exited with code " .. result.code,
          { title = "Pi " .. skill }
        )
      end
    end)
  end)
end

local COMMIT_PROMPT = [[
Write a git commit message for the staged diff below. Reply with the message only, without code fences.
Use this format:

<type>(<optional-scope>): <imperative summary>

<short intent-focused body>

The type is a Conventional Commit type. The summary has at most 72 characters.]]

-- `textgen` (from the flake's textGeneration option) writes the message from the
-- staged diff. The commit editor opens with it, so the message can change first.
local function generate_commit()
  local neogit = require("neogit")
  local cwd = neogit.status.instance().cwd
  local diff = vim.system({ "git", "diff", "--cached", "--no-color", "--no-ext-diff" }, { cwd = cwd, text = true }):wait()
  if diff.code ~= 0 or vim.trim(diff.stdout or "") == "" then
    Snacks.notify.warn("Nothing is staged.", { title = "Neogit" })
    return
  end

  local done = progress("Commit message")
  local prompt = COMMIT_PROMPT .. "\n\n<diff>\n" .. diff.stdout:sub(1, 60000) .. "\n</diff>\n"
  vim.system({ "textgen" }, { cwd = cwd, text = true, stdin = prompt }, function(result)
    vim.schedule(function()
      done()
      local message = vim.trim(((result.stdout or ""):gsub("^%s*```%w*\n", ""):gsub("\n```%s*$", "")))
      if result.code ~= 0 or message == "" then
        local err = vim.trim(result.stderr or "")
        Snacks.notify.error(err ~= "" and err:sub(-500) or "textgen exited with code " .. result.code, { title = "textgen" })
        return
      end
      local path = vim.fn.tempname()
      vim.fn.writefile(vim.split(message, "\n"), path)
      -- neogit.action() runs the commit outside an async context, which fails.
      local args = { "--edit", "--file=" .. path }
      require("neogit.lib.async").void(function()
        require("neogit.popups.commit.actions").commit({ get_arguments = function() return args end })
      end)()
    end)
  end)
end

local function create_ai_popup()
  local popup = require("neogit.lib.popup")
    .builder()
    :name("NeogitAiPopup")
    :new_action_group("AI")
    :action("c", "Commit", generate_commit)
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
      ["a"] = create_ai_popup,
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
