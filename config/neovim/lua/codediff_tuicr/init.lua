---@brief tuicr review comments inside CodeDiff's diff windows.
---
--- Binds a CodeDiff tab to a tuicr review session, then draws that session's
--- comments under the lines they target. Only public CodeDiff surface is used:
--- the `User CodeDiff*` events and `codediff://` buffer names, both of which
--- upstream documents (or, for the buffer scheme, plainly implements).
local M = {}

local render = require("codediff_tuicr.render")
local source = require("codediff_tuicr.source")

local SCHEME = "codediff://"

M.opts = {
  max_rows = 3, --- virtual rows per thread before the `+N more` row
  original_position = "left", --- CodeDiff's own default; only read when both panes are revisions
  username = nil, --- pass `--username` to `tuicr review add`; nil keeps tuicr's own identity
  auto_create = true, --- start a tuicr TUI when no session matches the diff
}

---@class codediff_tuicr.Pane
---@field win number
---@field buf number
---@field rev? string revision name or sha, nil for a working-tree file
---@field path string absolute, or repo-relative for a revision buffer
---@field root? string

---@class codediff_tuicr.View
---@field root? string
---@field path string repo-relative
---@field new codediff_tuicr.Pane
---@field old? codediff_tuicr.Pane

---@class codediff_tuicr.Binding
---@field view codediff_tuicr.View
---@field slug? string
---@field comments codediff_tuicr.Comment[]
---@field layout? codediff_tuicr.Layout

---@type table<number, codediff_tuicr.Binding>
local bindings = {}
---@type table<string, boolean>
local expanded = {}
---@type table<string, string>
local sha_cache = {}
--- The background TUIs this plugin started, one per repository and scope.
---@type table<string, { buf: number, root: string, tabpage: number, seen: table<string, string>, bound: string? }>
local tuicrs = {}
local types, type_index = {}, 1

---@param msg string
---@param level? integer
local function notify(msg, level) vim.notify("codediff-tuicr: " .. msg, level or vim.log.levels.INFO) end

--- Revision buffers are named `codediff:///<root>///<revision>/<path>`.
---@param buf number
---@return { root: string, rev: string, path: string }?
local function parse_revision(buf)
  local name = vim.api.nvim_buf_get_name(buf)
  if name:sub(1, #SCHEME) ~= SCHEME then
    return nil
  end
  local root, tail = name:sub(#SCHEME + 1):match("^/(.-)///(.+)$")
  -- `tail and tail:match(...)` would truncate to one value: only a call or a
  -- constructor expands to multiple returns in an assignment list.
  local rev, path
  if tail then
    rev, path = tail:match("^([^/]+)/(.+)$")
  end
  if not root or not rev or not path then
    return nil
  end
  return { root = "/" .. root, rev = rev, path = path }
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

---@param pane codediff_tuicr.Pane
---@param root string?
---@return string
local function pane_path(pane, root)
  if pane.rev then
    return pane.path
  end
  return relative(root, pane.path)
end

--- Resolve a revision name to a sha, so sessions can be matched by commit.
---@param root string
---@param rev string
---@param cb fun(sha: string?)
local function resolve_rev(root, rev, cb)
  if rev:match("^%x%x%x%x%x%x%x+$") then
    return cb(rev)
  end
  local key = root .. "|" .. rev
  if sha_cache[key] then
    return cb(sha_cache[key])
  end
  vim.system({ "git", "-C", root, "rev-parse", "--verify", rev }, { text = true }, function(result)
    vim.schedule(function()
      local sha = result.code == 0 and vim.trim(result.stdout or "") or ""
      if sha == "" then
        return cb(nil)
      end
      sha_cache[key] = sha
      cb(sha)
    end)
  end)
end

---@param view codediff_tuicr.View
---@param cb fun(shas: { head: string?, base: string? })
local function resolve_shas(view, cb)
  local shas, pending = {}, 0
  if not view.root then
    return cb(shas)
  end
  local function collect()
    pending = pending - 1
    if pending == 0 then
      cb(shas)
    end
  end
  for key, pane in pairs({ head = view.new, base = view.old }) do
    if pane and pane.rev then
      pending = pending + 1
      resolve_rev(view.root, pane.rev, function(sha)
        shas[key] = sha
        collect()
      end)
    end
  end
  if pending == 0 then
    cb(shas)
  end
end

--- The current HEAD of a checkout, or nil for an unborn branch.
---@param root string
---@param cb fun(sha: string?)
local function live_head(root, cb)
  vim.system({ "git", "-C", root, "rev-parse", "--verify", "HEAD" }, { text = true }, function(result)
    vim.schedule(function()
      local sha = vim.trim(result.stdout or "")
      cb(result.code == 0 and sha ~= "" and sha or nil)
    end)
  end)
end

--- The tuicr arguments that reproduce this view's diff, or nil when the view
--- names nothing to scope a review to. tuicr's own slug source segments are the
--- vocabulary here: `worktree` for uncommitted changes, `commits/<base>..<head>`
--- for a range, `pr/<n>` for a pull request. tuicr has no `review create`, so a
--- session can only come into being by starting its TUI on one of these.
---@param view codediff_tuicr.View
---@param cb fun(scope: string[]?)
function M.scope_for(view, cb)
  local old, new = view.old and view.old.rev, view.new.rev
  if not view.root then
    return cb(nil)
  end
  if not new then
    return cb(old and { "-w" } or nil) -- a working tree file against a revision
  end
  ---@param pr string?
  local function range(pr)
    if pr then
      return cb({ "pr", pr })
    end
    -- tuicr diffs a selection from the parent of its oldest commit, and git's
    -- range selects exactly the commits `old..new` adds, so the range already
    -- covers CodeDiff's diff. An inline layout has one pane, so its commit is
    -- the whole diff and has to be selected explicitly.
    -- ponytail: `old..new` only spans the whole diff when `old` is an ancestor
    -- of `new`; tuicr has no "diff these two revs" scope for anything else.
    cb({ "-r", (old and old or new .. "~1") .. ".." .. new })
  end
  if not old then
    return range(nil)
  end
  live_head(view.root, function(head)
    resolve_rev(view.root, new, function(sha)
      -- A diff that ends at the branch tip is the PR's own diff when one is
      -- open; anything older is a commit range.
      if head and sha == head then
        return source.open_pr(view.root, range)
      end
      range(nil)
    end)
  end)
end

--- Follow a TUI this plugin started: bind the tab to the session it persists,
--- and re-read it whenever tuicr reports a newer `updated_at`. The first TUI to
--- claim a tab keeps it, so two TUIs over one repo do not fight over the binding.
---@param tabpage number
---@param key string
---@param attempt integer
local function poll(tabpage, key, attempt)
  local tui = tuicrs[key]
  if not tui then
    return
  end
  if not vim.api.nvim_buf_is_valid(tui.buf) then
    tuicrs[key] = nil -- the TUI exited; a later diff may start another
    return
  end
  if not bindings[tabpage] then
    return
  end
  if attempt > 40 then
    return notify("tuicr started no session for this diff", vim.log.levels.WARN)
  end
  source.list_sessions(tui.root, function(sessions)
    local bound = bindings[tabpage].slug
    for _, session in ipairs(sessions) do
      local updated = session.updated_at or ""
      if updated ~= tui.seen[session.slug] and (not bound or bound == session.slug) then
        tui.seen[session.slug], tui.bound, bound = updated, session.slug, session.slug
        M.bind(tabpage, session.slug)
      end
    end
    vim.defer_fn(function() poll(tabpage, key, attempt + 1) end, 500)
  end)
end

--- Start a tuicr TUI in the background for whatever this diff is, then bind the
--- tab to the session it persists. One TUI per repository and scope.
---@param tabpage number
function M.create(tabpage)
  local view = bindings[tabpage] and bindings[tabpage].view or M.discover(tabpage)
  if not view then
    return notify("no CodeDiff view in this tab")
  end
  M.scope_for(view, function(scope)
    if not scope then
      return notify("this diff names no tuicr scope; it has to name a revision", vim.log.levels.WARN)
    end
    local key = view.root .. "|" .. table.concat(scope, " ")
    local running = tuicrs[key]
    if running then
      -- A TUI is already up for this scope; attach this tab to its session.
      return running.bound and M.bind(tabpage, running.bound)
    end
    local seen = {}
    -- Snapshot before the TUI runs, so the session it writes is the only new one.
    source.list_sessions(view.root, function(sessions, err)
      if err then
        return notify(err, vim.log.levels.WARN)
      end
      for _, session in ipairs(sessions) do
        seen[session.slug] = session.updated_at or ""
      end
      local terminal = Snacks.terminal.open(vim.list_extend({ "tuicr" }, scope), { cwd = view.root })
      tuicrs[key] = { buf = terminal.buf, root = view.root, tabpage = tabpage, seen = seen }
      poll(tabpage, key, 0)
    end)
  end)
end

--- Stop the background TUIs, for one tab or all of them. tuicr persists the
--- session as it goes, so killing the TUI costs the review nothing.
---@param tabpage? number
local function stop_tuicrs(tabpage)
  for key, tui in pairs(tuicrs) do
    if not tabpage or tui.tabpage == tabpage then
      local job = vim.api.nvim_buf_is_valid(tui.buf) and vim.b[tui.buf].terminal_job_id or nil
      if job then
        vim.fn.jobstop(job)
      end
      tuicrs[key] = nil
    end
  end
end

--- What a session is anchored to. Read from the session file `review list` names,
--- which is the only place the head sha and base commit are recorded.
---@param session table
---@return { head: string?, base: string?, ranged: boolean }?
local function identity(session)
  if not session.path or vim.fn.filereadable(session.path) ~= 1 then
    return nil
  end
  local raw = table.concat(vim.fn.readfile(session.path), "\n")
  local ok, data = pcall(vim.json.decode, raw, { luanil = { object = true, array = true } })
  if not ok or type(data) ~= "table" then
    return nil
  end
  local key = type(data.pr_session_key) == "table" and data.pr_session_key or nil
  return {
    head = type(key) == "table" and key.head_sha or nil,
    base = type(data.base_commit) == "string" and data.base_commit or nil,
    -- A commit range anchors on its newest commit, so its `base_commit` is the
    -- head of the diff it shows. Every other source anchors on HEAD, which is
    -- the base of the diff.
    ranged = type(data.diff_source) == "string" and data.diff_source:find("commit") ~= nil,
  }
end

--- The diff panes of a tab, newest side last. A revision buffer is always the
--- old side; a plain file buffer is the working tree, so it is the new side.
---@param tabpage number
---@return codediff_tuicr.View?
function M.discover(tabpage)
  local panes = {}
  for _, win in ipairs(vim.api.nvim_tabpage_list_wins(tabpage)) do
    local buf = vim.api.nvim_win_get_buf(win)
    if vim.api.nvim_buf_is_loaded(buf) then
      local revision = parse_revision(buf)
      local name = vim.api.nvim_buf_get_name(buf)
      if revision then
        panes[#panes + 1] = {
          win = win,
          buf = buf,
          rev = revision.rev,
          path = revision.path,
          root = revision.root,
        }
      elseif vim.bo[buf].buftype == "" and name:sub(1, 1) == "/" then
        panes[#panes + 1] = { win = win, buf = buf, path = name }
      end
    end
  end
  if #panes == 0 then
    return nil
  end
  table.sort(panes, function(a, b) return vim.fn.win_screenpos(a.win)[2] < vim.fn.win_screenpos(b.win)[2] end)

  ---@param new codediff_tuicr.Pane
  ---@param old codediff_tuicr.Pane?
  ---@return codediff_tuicr.View?
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
  if left.rev and not right.rev then
    return view(right, left)
  end
  if right.rev and not left.rev then
    return view(left, right)
  end
  return M.opts.original_position == "right" and view(left, right) or view(right, left)
end

---@param tabpage number
---@param view codediff_tuicr.View
local function setup_keys(tabpage, view)
  for _, pane in ipairs({ view.new, view.old }) do
    if pane and vim.api.nvim_buf_is_valid(pane.buf) then
      local opts = { buffer = pane.buf, nowait = true }
      Snacks.keymap.set(
        "n",
        "K",
        function() M.float_thread(tabpage) end,
        vim.tbl_extend("force", opts, { desc = "tuicr: thread" })
      )
      Snacks.keymap.set(
        "n",
        "]r",
        function() M.goto_thread(tabpage, 1) end,
        vim.tbl_extend("force", opts, { desc = "tuicr: next thread" })
      )
      Snacks.keymap.set(
        "n",
        "[r",
        function() M.goto_thread(tabpage, -1) end,
        vim.tbl_extend("force", opts, { desc = "tuicr: prev thread" })
      )
      Snacks.keymap.set(
        { "n", "x" },
        "ga",
        function()
          M.add(tabpage, vim.fn.mode() == "v" and {
            first = vim.fn.line("'<"),
            last = vim.fn.line("'>"),
          } or nil)
        end,
        vim.tbl_extend("force", opts, { desc = "tuicr: add comment" })
      )
      Snacks.keymap.set(
        "n",
        "gr",
        function() M.cycle_type() end,
        vim.tbl_extend("force", opts, { desc = "tuicr: cycle comment type" })
      )
      Snacks.keymap.set(
        "n",
        "<leader>rr",
        function() M.refresh(tabpage) end,
        vim.tbl_extend("force", opts, { desc = "tuicr: refresh" })
      )
      Snacks.keymap.set(
        "n",
        "<leader>rf",
        function() M.pick(tabpage) end,
        vim.tbl_extend("force", opts, { desc = "tuicr: pick session" })
      )
      Snacks.keymap.set(
        "n",
        "<leader>ra",
        function() M.add_review(tabpage) end,
        vim.tbl_extend("force", opts, { desc = "tuicr: add review comment" })
      )
      Snacks.keymap.set(
        "n",
        "<leader>rF",
        function() M.add_file(tabpage) end,
        vim.tbl_extend("force", opts, { desc = "tuicr: add file comment" })
      )
      Snacks.keymap.set(
        "n",
        "<leader>rd",
        function() M.delete_at_cursor(tabpage) end,
        vim.tbl_extend("force", opts, { desc = "tuicr: delete comment" })
      )
      Snacks.keymap.set(
        "n",
        "<leader>re",
        function() M.toggle_expand(tabpage) end,
        vim.tbl_extend("force", opts, { desc = "tuicr: expand thread" })
      )
      Snacks.keymap.set(
        "n",
        "<leader>rn",
        function() M.notes(tabpage) end,
        vim.tbl_extend("force", opts, { desc = "tuicr: review notes" })
      )
      Snacks.keymap.set(
        "n",
        "<leader>ru",
        function() M.unbind(tabpage) end,
        vim.tbl_extend("force", opts, { desc = "tuicr: unbind session" })
      )
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
  binding.layout = render.build(binding.comments, view.path, {
    max_rows = M.opts.max_rows,
    is_expanded = function(thread) return expanded[thread.key] == true end,
  })
  render.apply({ new = view.new.buf, old = view.old and view.old.buf }, binding.layout)
  setup_keys(tabpage, view)
end

---@param tabpage number
function M.bind(tabpage, slug)
  local binding = bindings[tabpage]
  if not binding then
    return notify("no CodeDiff view in this tab")
  end
  binding.slug = slug
  source.comments(slug, binding.view.root, function(comments, err)
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

--- Bind the tab to the one session whose head or base commit matches the diff.
--- Several matches, or none, leave the tab unbound and wait for the picker.
---@param tabpage number
function M.autobind(tabpage)
  local view = M.discover(tabpage)
  bindings[tabpage] = view and { view = view, comments = {} } or nil
  if not view then
    return
  end
  M.render(tabpage)
  if not view.root then
    return
  end
  resolve_shas(view, function(shas)
    source.list_sessions(view.root, function(sessions, err)
      if err then
        return notify(err, vim.log.levels.WARN)
      end
      local matches = {}
      for _, session in ipairs(sessions) do
        local id = identity(session)
        local hit = id
          and (
            (id.head and id.head == shas.head)
            or (id.base and (id.base == shas.base or (id.ranged and id.base == shas.head)))
          )
        if hit then
          matches[#matches + 1] = session
        end
      end
      if #matches == 1 then
        M.bind(tabpage, matches[1].slug)
      elseif #matches > 1 then
        M.pick(tabpage, matches)
      elseif M.opts.auto_create then
        M.create(tabpage)
      elseif #sessions > 0 then
        notify("no tuicr session matches this diff; <leader>rf picks one")
      end
    end)
  end)
end

---@param tabpage number
---@return codediff_tuicr.Binding?
local function bound(tabpage)
  local binding = bindings[tabpage]
  if not binding or not binding.slug then
    notify("no tuicr session bound; <leader>rf picks one")
    return nil
  end
  return binding
end

---@param tabpage number
---@return "new"|"old"
local function cursor_side(binding)
  local win = vim.api.nvim_get_current_win()
  if binding.view.old and win == binding.view.old.win then
    return "old"
  end
  return "new"
end

function M.float_thread(tabpage)
  local binding = bound(tabpage)
  if not binding or not binding.layout then
    return
  end
  local win = vim.api.nvim_get_current_win()
  local thread = render.thread_at(binding.layout, cursor_side(binding), vim.api.nvim_win_get_cursor(win)[1])
  if not thread then
    return notify("no tuicr comment on this line")
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
  Snacks.input(
    { prompt = string.format("tuicr %s:%d-%d [%s]", binding.view.path, first, last, types[type_index]) },
    function(content)
      if not content or vim.trim(content) == "" then
        return
      end
      source.add({
        slug = binding.slug,
        repo = binding.view.root,
        path = binding.view.path,
        line = first,
        end_line = last ~= first and last or nil,
        side = side,
        type = types[type_index],
        username = M.opts.username,
        content = content,
      }, function(ok, err)
        if not ok then
          return notify(err, vim.log.levels.WARN)
        end
        M.refresh(tabpage)
      end)
    end
  )
end

function M.add_file(tabpage)
  local binding = bound(tabpage)
  if not binding then
    return
  end
  Snacks.input({ prompt = string.format("tuicr file comment on %s", binding.view.path) }, function(content)
    if not content or vim.trim(content) == "" then
      return
    end
    source.add({
      slug = binding.slug,
      repo = binding.view.root,
      path = binding.view.path,
      type = types[type_index],
      username = M.opts.username,
      content = content,
    }, function(ok, err)
      if not ok then
        return notify(err, vim.log.levels.WARN)
      end
      M.refresh(tabpage)
    end)
  end)
end

function M.add_review(tabpage)
  local binding = bound(tabpage)
  if not binding then
    return
  end
  Snacks.input({ prompt = "tuicr review comment" }, function(content)
    if not content or vim.trim(content) == "" then
      return
    end
    source.add({
      slug = binding.slug,
      repo = binding.view.root,
      type = types[type_index],
      username = M.opts.username,
      content = content,
    }, function(ok, err)
      if not ok then
        return notify(err, vim.log.levels.WARN)
      end
      M.refresh(tabpage)
    end)
  end)
end

function M.delete_at_cursor(tabpage)
  local binding = bound(tabpage)
  if not binding or not binding.layout then
    return
  end
  local thread = render.thread_at(binding.layout, cursor_side(binding), vim.api.nvim_win_get_cursor(0)[1])
  if not thread then
    return notify("no tuicr comment on this line")
  end
  local items = vim.tbl_map(
    function(comment)
      return {
        comment = comment,
        text = string.format(
          "%s · %s · %s",
          comment.author,
          comment.comment_type,
          vim.split(comment.content, "\n")[1]
        ),
      }
    end,
    thread.comments
  )
  Snacks.picker.pick({
    items = items,
    title = "delete tuicr comment",
    format = "text",
    confirm = function(picker, item)
      picker:close()
      if not item then
        return
      end
      source.delete(binding.slug, item.comment.id, binding.view.root, function(ok, err)
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

function M.cycle_type()
  type_index = type_index % #types + 1
  notify("comment type: " .. types[type_index])
end

function M.notes(tabpage)
  local binding = bound(tabpage)
  if not binding then
    return
  end
  render.notes_float(binding.comments)
end

function M.refresh(tabpage)
  local binding = bindings[tabpage]
  if not binding then
    return
  end
  if not binding.slug then
    return notify("no tuicr session bound; <leader>rf picks one")
  end
  M.bind(tabpage, binding.slug)
end

function M.pick(tabpage, sessions)
  local binding = bindings[tabpage]
  if not binding then
    return notify("no CodeDiff view in this tab")
  end
  local function choose(list)
    if #list == 0 then
      return notify("no tuicr sessions for this repository")
    end
    local items = vim.tbl_map(
      function(session)
        return {
          session = session,
          text = string.format(
            "%-44s %s  %d comment(s)%s",
            session.slug,
            (session.updated_at or ""):sub(1, 19),
            session.comment_count or 0,
            session.active and "  active" or ""
          ),
        }
      end,
      list
    )
    Snacks.picker.pick({
      items = items,
      title = "tuicr review session",
      format = "text",
      confirm = function(picker, item)
        picker:close()
        if item then
          M.bind(tabpage, item.session.slug)
        end
      end,
    })
  end
  if sessions then
    return choose(sessions)
  end
  source.list_sessions(binding.view.root or vim.fn.getcwd(), function(list, err)
    if err then
      return notify(err, vim.log.levels.WARN)
    end
    choose(list)
  end)
end

function M.unbind(tabpage)
  local binding = bindings[tabpage]
  if not binding then
    return
  end
  binding.slug, binding.comments, binding.layout = nil, {}, nil
  render.apply({ new = binding.view.new.buf, old = binding.view.old and binding.view.old.buf }, {
    new = {},
    old = {},
    threads = {},
    rows = {},
  })
  notify("unbound")
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

function M.setup(opts)
  M.opts = vim.tbl_deep_extend("force", M.opts, opts or {})
  types = source.comment_types()
  render.define_highlights()

  local group = vim.api.nvim_create_augroup("codediff_tuicr", { clear = true })
  vim.api.nvim_create_autocmd("User", {
    group = group,
    pattern = "CodeDiffOpen",
    callback = function(event) M.autobind(event.data.tabpage) end,
  })
  vim.api.nvim_create_autocmd("User", {
    group = group,
    pattern = { "CodeDiffFileSelect", "CodeDiffVirtualFileLoaded" },
    callback = function(event)
      local tabpage = event.data.tabpage or (event.data.buf and tabpage_for_buf(event.data.buf))
      if not tabpage then
        return
      end
      vim.schedule(function()
        -- The explorer selects a file before its diff panes exist, so the first
        -- event for a tab is the one that has to look for a session.
        if bindings[tabpage] then
          M.render(tabpage)
        else
          M.autobind(tabpage)
        end
      end)
    end,
  })
  vim.api.nvim_create_autocmd("User", {
    group = group,
    pattern = "CodeDiffClose",
    callback = function(event)
      local tabpage = event.data.tabpage
      if bindings[tabpage] then
        bindings[tabpage] = nil
      end
      stop_tuicrs(tabpage)
    end,
  })
  vim.api.nvim_create_autocmd("VimLeavePre", {
    group = group,
    callback = function() stop_tuicrs() end,
  })
  vim.api.nvim_create_autocmd("FocusGained", {
    group = group,
    -- Only a bound tab has anything to re-read; an unbound one would nag on
    -- every alt-tab.
    callback = function()
      local tabpage = vim.api.nvim_get_current_tabpage()
      local binding = bindings[tabpage]
      if binding and binding.slug then
        M.refresh(tabpage)
      end
    end,
  })

  local command = vim.api.nvim_create_user_command
  command(
    "CodeDiffTuicrSession",
    function() M.pick(vim.api.nvim_get_current_tabpage()) end,
    { desc = "Pick the tuicr session to show in this diff" }
  )
  command(
    "CodeDiffTuicrRefresh",
    function() M.refresh(vim.api.nvim_get_current_tabpage()) end,
    { desc = "Re-read the bound tuicr session" }
  )
  command(
    "CodeDiffTuicrNotes",
    function() M.notes(vim.api.nvim_get_current_tabpage()) end,
    { desc = "Show review-level tuicr comments" }
  )
  command(
    "CodeDiffTuicrUnbind",
    function() M.unbind(vim.api.nvim_get_current_tabpage()) end,
    { desc = "Stop showing tuicr comments in this diff" }
  )
  command(
    "CodeDiffTuicrNew",
    function() M.create(vim.api.nvim_get_current_tabpage()) end,
    { desc = "Start a tuicr session scoped to this diff" }
  )
end

return M
