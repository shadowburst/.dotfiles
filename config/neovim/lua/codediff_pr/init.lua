---@brief GitHub pull request review comments inside CodeDiff's diff windows.
---
--- The plugin opens a pull request's own diff (`:CodeDiff pr <n>` fetches the
--- merge base, which is the same three-dot diff GitHub anchors its review
--- comments to), then draws that pull request's review threads under the lines
--- they target. Comments you write here are held back until you send the
--- review, so a half-finished pass never reaches the pull request.
---
--- Only public CodeDiff surface is used: the `User CodeDiff*` events and
--- `codediff://` buffer names, both of which upstream documents (or, for the
--- buffer scheme, plainly implements).
local M = {}

local render = require("codediff_pr.render")
local source = require("codediff_pr.source")

local SCHEME = "codediff://"

M.opts = {
  max_rows = 3, --- virtual rows per thread before the `+N more` row
}

---@class codediff_pr.Pane
---@field win number
---@field buf number
---@field revision boolean
---@field path string absolute, or repo-relative for a revision buffer
---@field root? string

---@class codediff_pr.View
---@field root? string
---@field path string repo-relative
---@field new codediff_pr.Pane
---@field old? codediff_pr.Pane

---@class codediff_pr.Binding
---@field pr codediff_pr.Pull
---@field view codediff_pr.View
---@field comments table[]
---@field reviews table[]
---@field pending table[]
---@field layout? codediff_pr.Layout

---@type table<number, codediff_pr.Binding>
local bindings = {}
---@type table<string, boolean>
local expanded = {}
--- Distinguishes held-back comments from each other; see `M.add`.
local pending_seq = 0
--- The pull request a launched diff is waiting to be bound to, by tabpage.
---@type table<number, codediff_pr.Pull>
local launching = {}
--- The pull request of a `:CodeDiff pr` that has not reported its tab yet.
---@type codediff_pr.Pull?
local opened

---@param msg string
---@param level? integer
local function notify(msg, level) vim.notify("codediff-pr: " .. msg, level or vim.log.levels.INFO) end

---@param text string
---@return string
local function headline(text) return vim.trim(vim.split(vim.trim(text or ""), "\n")[1] or "") end

-- Pending comments are kept in a file rather than in the tab, so that closing
-- the diff -- or quitting Neovim mid-review -- costs a re-open, not the review.
---@param pull codediff_pr.Pull
---@return string
local function pending_path(pull)
  local slug = pull.owner:gsub("[^%w._-]", "-") .. "_" .. pull.name:gsub("[^%w._-]", "-")
  return string.format("%s/codediff-pr/%s/%d.json", vim.fn.stdpath("state"), slug, pull.number)
end

---@param pull codediff_pr.Pull
---@param comments table[]
local function save_pending(pull, comments)
  local path = pending_path(pull)
  if #comments == 0 then
    pcall(vim.fn.delete, path)
    return
  end
  vim.fn.mkdir(vim.fs.dirname(path), "p")
  pcall(vim.fn.writefile, { vim.json.encode(comments) }, path)
end

---@param pull codediff_pr.Pull
---@return table[]
local function load_pending(pull)
  local path = pending_path(pull)
  if vim.fn.filereadable(path) ~= 1 then
    return {}
  end
  local raw = table.concat(vim.fn.readfile(path), "\n")
  local ok, comments = pcall(vim.json.decode, raw, { luanil = { object = true, array = true } })
  return ok and type(comments) == "table" and comments or {}
end

--- Revision buffers are named `codediff:///<root>///<revision>/<path>`.
---@param buf number
---@return { root: string, path: string }?
local function parse_revision(buf)
  local name = vim.api.nvim_buf_get_name(buf)
  if name:sub(1, #SCHEME) ~= SCHEME then
    return nil
  end
  local root, rev, path = name:sub(#SCHEME + 1):match("^/(.-)///([^/]+)/(.+)$")
  if not root or not rev or not path then
    return nil
  end
  return { root = "/" .. root, path = path }
end

---@param dir string?
---@return string?
local function git_root(dir)
  if not dir then
    return nil
  end
  local found = vim.fs.find(".git", { upward = true, path = dir, type = "directory", limit = 1 })[1]
  return found and vim.fs.dirname(found) or nil
end

---@param root string?
---@param path string
---@return string
local function relative(root, path)
  if root and path:sub(1, #root + 1) == root .. "/" then
    return path:sub(#root + 2)
  end
  return path
end

---@param pane codediff_pr.Pane
---@param root string?
---@return string
local function pane_path(pane, root)
  if pane.revision then
    return pane.path
  end
  return relative(root, pane.path)
end

--- The diff panes of a tab, newest side last. A revision buffer is always the
--- old side; a plain file buffer is the working tree, so it is the new side.
---@param tabpage number
---@return codediff_pr.View?
function M.discover(tabpage)
  local panes = {}
  for _, win in ipairs(vim.api.nvim_tabpage_list_wins(tabpage)) do
    local buf = vim.api.nvim_win_get_buf(win)
    if vim.api.nvim_buf_is_loaded(buf) then
      local revision = parse_revision(buf)
      local name = vim.api.nvim_buf_get_name(buf)
      if revision then
        panes[#panes + 1] = { win = win, buf = buf, revision = true, path = revision.path, root = revision.root }
      elseif vim.bo[buf].buftype == "" and name:sub(1, 1) == "/" then
        panes[#panes + 1] = { win = win, buf = buf, revision = false, path = name }
      end
    end
  end
  if #panes == 0 then
    return nil
  end
  table.sort(panes, function(a, b) return vim.fn.win_screenpos(a.win)[2] < vim.fn.win_screenpos(b.win)[2] end)

  ---@param new codediff_pr.Pane
  ---@param old codediff_pr.Pane?
  ---@return codediff_pr.View
  local function view(new, old)
    local root = (old and old.root) or new.root or git_root(vim.fs.dirname(new.path))
    return { root = root, path = pane_path(new, root), new = new, old = old }
  end

  -- One pane is CodeDiff's inline layout, which only ever shows the new side.
  if #panes == 1 then
    return view(panes[1], nil)
  end
  if #panes > 2 then
    return nil -- conflict view; not a review surface
  end
  local left, right = panes[1], panes[2]
  if left.revision and not right.revision then
    return view(right, left)
  end
  if right.revision and not left.revision then
    return view(left, right)
  end
  -- Two revisions: CodeDiff's own `original_position` default puts the base on
  -- the left, and a pull request diff is always base against head.
  return view(right, left)
end

---@param tabpage number
---@param view codediff_pr.View
local function setup_keys(tabpage, view)
  for _, pane in ipairs({ view.new, view.old }) do
    if pane and vim.api.nvim_buf_is_valid(pane.buf) then
      local opts = { buffer = pane.buf, nowait = true }
      local function bind(mode, key, fn, desc)
        Snacks.keymap.set(mode, key, fn, vim.tbl_extend("force", opts, { desc = desc }))
      end
      bind("n", "K", function() M.float_thread(tabpage) end, "Thread")
      bind("n", "]r", function() M.goto_thread(tabpage, 1) end, "Next thread")
      bind("n", "[r", function() M.goto_thread(tabpage, -1) end, "Prev thread")
      bind(
        { "n", "x" },
        "<leader>ra",
        function()
          M.add(tabpage, vim.fn.mode() == "v" and { first = vim.fn.line("'<"), last = vim.fn.line("'>") } or nil)
        end,
        "Add comment"
      )
      bind("n", "R", function() M.refresh(tabpage) end, "Refresh")
      bind("n", "<leader>rs", function() M.submit(tabpage) end, "Send review")
      bind("n", "<leader>rd", function() M.delete_at_cursor(tabpage) end, "Delete comment")
      bind("n", "<leader>re", function() M.toggle_expand(tabpage) end, "Expand thread")
      bind("n", "<leader>rn", function() M.reviews(tabpage) end, "Reviews")
      bind("n", "<leader>ru", function() M.discard(tabpage) end, "Discard unsent comment")
    end
  end
end

---@param buf number
---@return number?
local function tabpage_for_buf(buf)
  for _, tabpage in ipairs(vim.api.nvim_list_tabpages()) do
    for _, win in ipairs(vim.api.nvim_tabpage_list_wins(tabpage)) do
      if vim.api.nvim_win_get_buf(win) == buf then
        return tabpage
      end
    end
  end
end

---@param tabpage number
function M.render(tabpage)
  local binding = bindings[tabpage]
  if not binding then
    return
  end
  local view = M.discover(tabpage) or binding.view
  binding.view = view
  local shown = vim.list_extend(vim.list_extend({}, binding.comments), binding.pending)
  binding.layout = render.build(shown, view.path, {
    max_rows = M.opts.max_rows,
    is_expanded = function(thread) return expanded[thread.key] == true end,
    pr_author = binding.pr.author,
  })
  render.apply({ new = view.new.buf, old = view.old and view.old.buf }, binding.layout)
  setup_keys(tabpage, view)
end

---@param tabpage number
---@param pull codediff_pr.Pull
function M.bind(tabpage, pull)
  local view = M.discover(tabpage)
  if not view then
    return notify("no CodeDiff view in this tab yet", vim.log.levels.WARN)
  end
  bindings[tabpage] = { pr = pull, view = view, comments = {}, reviews = {}, pending = load_pending(pull) }
  M.render(tabpage)
  M.refresh(tabpage)
  source.reviews(pull, function(reviews, err)
    if err then
      return notify(err, vim.log.levels.WARN)
    end
    if bindings[tabpage] then
      bindings[tabpage].reviews = reviews
    end
  end)
end

---@param tabpage number
function M.refresh(tabpage)
  local binding = bindings[tabpage]
  if not binding then
    return
  end
  source.threads(binding.pr, function(comments, err)
    if err then
      return notify(err, vim.log.levels.WARN)
    end
    if not bindings[tabpage] then
      return
    end
    bindings[tabpage].comments = comments
    M.render(tabpage)
  end)
end

--- Bind a launched diff as soon as it has panes. CodeDiff opens its explorer
--- on a welcome window, so the first event for a tab can arrive before there is
--- anything to read.
---@param tabpage number
local function try_bind(tabpage)
  if bindings[tabpage] then
    return M.render(tabpage)
  end
  local pull = launching[tabpage]
  if pull and M.discover(tabpage) then
    launching[tabpage] = nil
    M.bind(tabpage, pull)
  end
end

---@param pull codediff_pr.Pull
function M.open(pull)
  opened = pull
  local ok = pcall(vim.cmd, "CodeDiff pr " .. pull.number)
  if not ok then
    opened = nil
    notify("could not open the pull request diff", vim.log.levels.ERROR)
  end
end

--- Every open pull request in the checkout, with whatever is still unsent on
--- each one. This is the only door: a diff this plugin did not open is a diff
--- it has no pull request for.
function M.pick_pull()
  source.load_repo(function(repo_err)
    if repo_err then
      return notify(repo_err, vim.log.levels.WARN)
    end
    source.list_pulls(function(pulls, err)
      if err then
        return notify(err, vim.log.levels.WARN)
      end
      if #pulls == 0 then
        return notify("no open pull requests in this repository")
      end
      Snacks.picker.pick({
        items = vim.tbl_map(function(pull)
          local unsent = #load_pending(pull)
          return {
            pull = pull,
            text = string.format(
              "#%-5d %s%-9s %s  ·  %s%s",
              pull.number,
              pull.draft and "[draft] " or "",
              pull.review ~= "" and pull.review or "",
              pull.title,
              pull.author,
              unsent > 0 and ("  ·  " .. unsent .. " unsent") or ""
            ),
          }
        end, pulls),
        title = "pull requests",
        format = "text",
        confirm = function(picker, item)
          picker:close()
          if item then
            M.open(item.pull)
          end
        end,
      })
    end)
  end)
end

---@param tabpage number
---@return codediff_pr.Binding?
local function bound(tabpage)
  local binding = bindings[tabpage]
  if not binding then
    notify("no pull request bound to this diff; <leader>rr picks one")
    return nil
  end
  return binding
end

---@param binding codediff_pr.Binding
---@return "new"|"old"
local function cursor_side(binding)
  local win = vim.api.nvim_get_current_win()
  if binding.view.old and win == binding.view.old.win then
    return "old"
  end
  return "new"
end

function M.float_thread(tabpage)
  local binding = bindings[tabpage]
  if not binding or not binding.layout then
    return
  end
  local win = vim.api.nvim_get_current_win()
  local thread = render.thread_at(binding.layout, cursor_side(binding), vim.api.nvim_win_get_cursor(win)[1])
  if not thread then
    return notify("no pull request comment on this line")
  end
  render.thread_float(thread)
end

function M.goto_thread(tabpage, dir)
  local binding = bindings[tabpage]
  local rows = binding and binding.layout and binding.layout.rows or {}
  if #rows == 0 then
    return
  end
  local win = vim.api.nvim_get_current_win()
  local row = vim.api.nvim_win_get_cursor(win)[1]
  local target
  for _, candidate in ipairs(rows) do
    if dir > 0 and candidate > row then
      target = candidate
      break
    elseif dir < 0 and candidate < row then
      target = candidate
    end
  end
  target = target or (dir > 0 and rows[1] or rows[#rows])

  local pane = binding.view.new
  if binding.view.old and win == binding.view.old.win then
    pane = binding.view.old
  end
  local lines = vim.api.nvim_buf_line_count(pane.buf)
  vim.api.nvim_win_set_cursor(pane.win, { math.min(target, lines), 0 })
end

--- Hold a comment back until the review is sent, so a pass in progress is
--- never half-published.
---@param tabpage number
---@param range? { first: number, last: number }
function M.add(tabpage, range)
  local binding = bound(tabpage)
  if not binding then
    return
  end
  local side = cursor_side(binding)
  local first = range and range.first or vim.api.nvim_win_get_cursor(0)[1]
  local last = range and range.last or first
  Snacks.input({ prompt = string.format("pr %s:%d-%d", binding.view.path, first, last) }, function(content)
    if not content or vim.trim(content) == "" then
      return
    end
    pending_seq = pending_seq + 1
    binding.pending[#binding.pending + 1] = {
      -- Unique within a session and across restarts, so discarding one comment
      -- never picks another's row out of the list.
      id = ("pending:%d.%d"):format(os.time(), pending_seq),
      path = binding.view.path,
      end_line = first,
      start_line = last ~= first and first or nil,
      side = side,
      author = "you",
      content = content,
      resolved = false,
      outdated = false,
      deletable = true,
      pending = true,
    }
    save_pending(binding.pr, binding.pending)
    M.render(tabpage)
  end)
end

---@param pull codediff_pr.Pull
---@param pending table[]
---@param done fun()
function M.send(pull, pending, done)
  Snacks.input({ prompt = "review summary (empty for none)" }, function(body)
    Snacks.picker.pick({
      items = { { event = "COMMENT" }, { event = "APPROVE" }, { event = "REQUEST_CHANGES" } },
      title = string.format("send %d comment(s) as", #pending),
      format = function(item) return item.event end,
      confirm = function(picker, item)
        picker:close()
        if not item then
          return
        end
        local threads = vim.tbl_map(
          function(comment)
            return {
              path = comment.path,
              line = comment.end_line,
              side = comment.side == "old" and "LEFT" or "RIGHT",
              startLine = comment.start_line,
              body = comment.content,
            }
          end,
          pending
        )
        source.submit(pull, body or "", item.event, threads, function(ok, err)
          if not ok then
            return notify(
              "the review was not accepted: " .. (err or "unknown error") .. " -- if the pull request moved, reopen it",
              vim.log.levels.WARN
            )
          end
          for index = #pending, 1, -1 do
            pending[index] = nil
          end
          save_pending(pull, pending)
          notify("review sent as " .. item.event)
          done()
        end)
      end,
    })
  end)
end

function M.submit(tabpage)
  local binding = bound(tabpage)
  if not binding or #binding.pending == 0 then
    return notify("nothing unsent; add a comment with <leader>ra first")
  end
  M.send(binding.pr, binding.pending, function() M.render(tabpage) end)
end

---@param pull codediff_pr.Pull
---@param pending table[]
---@param done fun()
local function discard_from(pull, pending, done)
  if #pending == 0 then
    return done()
  end
  Snacks.picker.pick({
    items = vim.tbl_map(
      function(comment)
        return {
          comment = comment,
          text = string.format("%s:%s  %s", comment.path, comment.end_line, headline(comment.content)),
        }
      end,
      pending
    ),
    title = "discard an unsent comment",
    format = "text",
    confirm = function(picker, item)
      picker:close()
      if not item then
        return
      end
      for index, candidate in ipairs(pending) do
        if candidate.id == item.comment.id then
          table.remove(pending, index)
          break
        end
      end
      save_pending(pull, pending)
      done()
    end,
  })
end

function M.discard(tabpage)
  local binding = bound(tabpage)
  if not binding then
    return
  end
  discard_from(binding.pr, binding.pending, function() M.render(tabpage) end)
end

function M.delete_at_cursor(tabpage)
  local binding = bound(tabpage)
  if not binding or not binding.layout then
    return
  end
  local thread = render.thread_at(binding.layout, cursor_side(binding), vim.api.nvim_win_get_cursor(0)[1])
  if not thread then
    return notify("no pull request comment on this line")
  end
  local items = {}
  for _, comment in ipairs(thread.comments) do
    if comment.deletable and comment.database_id then
      items[#items + 1] =
        { comment = comment, text = string.format("%s  %s", comment.author, headline(comment.content)) }
    end
  end
  if #items == 0 then
    return notify("GitHub only lets you delete your own comments, and this thread has none of yours")
  end
  Snacks.picker.pick({
    items = items,
    title = "delete your comment",
    format = "text",
    confirm = function(picker, item)
      picker:close()
      if not item then
        return
      end
      source.delete(binding.pr, item.comment.database_id, function(ok, err)
        if not ok then
          return notify(err, vim.log.levels.WARN)
        end
        M.refresh(tabpage)
      end)
    end,
  })
end

function M.toggle_expand(tabpage)
  local binding = bindings[tabpage]
  if not binding or not binding.layout then
    return
  end
  local thread = render.thread_at(binding.layout, cursor_side(binding), vim.api.nvim_win_get_cursor(0)[1])
  if not thread then
    return
  end
  expanded[thread.key] = not expanded[thread.key]
  M.render(tabpage)
end

function M.reviews(tabpage)
  local binding = bound(tabpage)
  if not binding then
    return
  end
  render.reviews_float(binding.reviews)
end

--- A review in progress when the diff goes away is worth one question: after
--- this the only trace of it is a file in `state/`.
---@param binding codediff_pr.Binding
local function farewell(binding)
  Snacks.picker.pick({
    items = {
      { choice = "send", text = string.format("Send the review (%d comment(s))", #binding.pending) },
      { choice = "discard", text = "Discard them" },
      { choice = "keep", text = "Keep them for next time" },
    },
    title = "unsent review comments",
    format = "text",
    confirm = function(picker, item)
      picker:close()
      if not item then
        return
      end
      if item.choice == "send" then
        M.send(binding.pr, binding.pending, function() end)
      elseif item.choice == "discard" then
        discard_from(binding.pr, binding.pending, function() end)
      end
    end,
  })
end

---@param tabpage number
function M.setup(opts)
  M.opts = vim.tbl_deep_extend("force", M.opts, opts or {})
  render.define_highlights()

  local group = vim.api.nvim_create_augroup("codediff_pr", { clear = true })
  vim.api.nvim_create_autocmd("User", {
    group = group,
    pattern = "CodeDiffOpen",
    callback = function(event)
      -- Only a diff this plugin launched claims a pull request, and only in the
      -- tab it landed in.
      if opened and event.data.tabpage == vim.api.nvim_get_current_tabpage() then
        launching[event.data.tabpage] = opened
        opened = nil
      end
      try_bind(event.data.tabpage)
    end,
  })
  vim.api.nvim_create_autocmd("User", {
    group = group,
    pattern = { "CodeDiffFileSelect", "CodeDiffVirtualFileLoaded" },
    callback = function(event)
      -- Only the file-select event names a tab; a loaded virtual file has to
      -- be traced back to one, and it is the first event that arrives with
      -- the diff panes actually in place.
      local tabpage = event.data.tabpage or (event.data.buf and tabpage_for_buf(event.data.buf))
      if not tabpage then
        return
      end
      vim.schedule(function() try_bind(tabpage) end)
    end,
  })
  vim.api.nvim_create_autocmd("User", {
    group = group,
    pattern = "CodeDiffClose",
    callback = function(event)
      local tabpage = event.data.tabpage
      local binding = bindings[tabpage]
      bindings[tabpage], launching[tabpage] = nil, nil
      -- Quitting Neovim unwinds the UI; a picker opened here would never be
      -- answered. The pending comments are already on disk either way.
      if binding and #binding.pending > 0 and not vim.v.exiting then
        farewell(binding)
      end
    end,
  })

  local command = vim.api.nvim_create_user_command
  command("CodeDiffPr", function() M.pick_pull() end, { desc = "Review a pull request in CodeDiff" })
  command(
    "CodeDiffPrSubmit",
    function() M.submit(vim.api.nvim_get_current_tabpage()) end,
    { desc = "Send the held-back review" }
  )
  command(
    "CodeDiffPrRefresh",
    function() M.refresh(vim.api.nvim_get_current_tabpage()) end,
    { desc = "Re-read the pull request's review threads" }
  )
  command(
    "CodeDiffPrReviews",
    function() M.reviews(vim.api.nvim_get_current_tabpage()) end,
    { desc = "Show the reviews on this pull request" }
  )
  command(
    "CodeDiffPrDiscard",
    function() M.discard(vim.api.nvim_get_current_tabpage()) end,
    { desc = "Drop an unsent comment" }
  )

  Snacks.keymap.set("n", "<leader>rr", "<cmd>CodeDiffPr<cr>", { desc = "Review a pull request" })
end

return M
