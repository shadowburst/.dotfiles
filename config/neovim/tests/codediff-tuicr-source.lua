-- Run: nvim -u NONE -l config/neovim/tests/codediff-tuicr-source.lua
vim.opt.runtimepath:prepend(vim.fn.stdpath("config"))

local source = require("codediff_tuicr.source")
local tuicr = require("codediff_tuicr")

-- A fake tuicr on PATH, so the argv, the exit codes and the JSON decoding are all
-- exercised for real instead of stubbed out.
local self_path = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":p")
local root = vim.fs.dirname(
  assert(vim.fs.find(".git", { upward = true, path = vim.fs.dirname(self_path), type = "directory" })[1])
)
local rel = self_path:sub(#root + 2)
local dir = vim.fn.tempname()
vim.fn.mkdir(dir, "p")

local session_file = dir .. "/session.json"
local list_file = dir .. "/list.json"
local argv_log = dir .. "/argv"
local base = "0123456789abcdef0123456789abcdef01234567"
local head = "fedcba9876543210fedcba9876543210fedcba98"
local other = "1111111111111111111111111111111111111111"
local alone = "2222222222222222222222222222222222222222"
local twin = "3333333333333333333333333333333333333333"
local fresh = "4444444444444444444444444444444444444444"

-- `review list` prints an array of summaries, each naming the session file that
-- holds the commits the session is anchored to. The second one is a commit
-- range, which tuicr anchors on its newest commit rather than on HEAD.
local ranged_file = dir .. "/ranged.json"
vim.fn.writefile({
  '[{ "slug": "shadowburst/.dotfiles@main/worktree", "kind": "local", "path": "' .. session_file .. '",',
  '  "updated_at": "2026-09-26T10:00:00Z", "comment_count": 1, "reviewed_count": 0, "file_count": 1,',
  '  "anchor": "HEAD~1", "active": false },',
  '{ "slug": "shadowburst/.dotfiles@main/commits/aaa..bbb", "kind": "local", "path": "' .. ranged_file .. '",',
  '  "updated_at": "2026-09-26T10:00:00Z", "comment_count": 0, "reviewed_count": 0, "file_count": 1,',
  '  "anchor": "main", "active": false }]',
}, list_file)
vim.fn.writefile({
  '{ "id": "s", "version": "1", "repo_path": "' .. root .. '", "branch_name": "main",',
  '  "base_commit": "' .. base .. '", "diff_source": "working_tree", "files": {} }',
}, session_file)
vim.fn.writefile({
  '{ "id": "s2", "version": "1", "repo_path": "' .. root .. '", "branch_name": "main",',
  '  "base_commit": "' .. head .. '", "diff_source": "commit_range",',
  '  "commit_range": ["' .. head .. '"], "files": {} }',
}, ranged_file)

local script = dir .. "/tuicr"
vim.fn.writefile({
  "#!/usr/bin/env bash",
  'printf "%s\\n" "$*" >> ' .. argv_log,
  'case "$1 $2" in',
  '  "review list") cat ' .. list_file .. " ;;",
  '  "review comments") echo \'[{"id":"c1","location":"x:3","path":"src/a.lua","start_line":3,"end_line":3,',
  '    "side":"new","comment_type":"note","author":"alice","lifecycle_state":"local_draft",',
  '    "created_at":"2026-09-26T10:00:00Z","content":"first line\\nsecond line"}]\' ;;',
  '  "review add") exit 0 ;;',
  '  "review delete") exit 0 ;;',
  "  *) echo 'unexpected: $*' >&2; exit 2 ;;",
  "esac",
}, script)
vim.fn.setfperm(script, "rwxr-xr-x")
vim.env.PATH = dir .. ":" .. vim.env.PATH

---@param fn function
---@return any
local function await(fn)
  local done, result = false, nil
  fn(function(value)
    result = value
    done = true
  end)
  vim.wait(5000, function() return done end, 10)
  assert(done, "tuicr call never answered")
  return result
end

-- 1. `review list` is parsed into session rows
local sessions = await(function(cb)
  source.list_sessions(root, function(list, err)
    assert(err == nil, "list failed: " .. tostring(err))
    cb(list)
  end)
end)
assert(#sessions == 2 and sessions[1].slug == "shadowburst/.dotfiles@main/worktree", "two sessions, got " .. #sessions)

-- 2. `review comments` keeps line, side and author, and leaves the body intact
local comments = await(function(cb)
  source.comments(sessions[1].slug, root, function(list, err)
    assert(err == nil, "comments failed: " .. tostring(err))
    cb(list)
  end)
end)
assert(#comments == 1, "one comment, got " .. #comments)
assert(comments[1].line == nil and comments[1].start_line == 3, "line 3, got " .. tostring(comments[1].start_line))
assert(comments[1].side == "new" and comments[1].author == "alice", "side and author survive")
assert(comments[1].content == "first line\nsecond line", "the body keeps its newline")

-- 3. a line comment is spelled with the flags tuicr documents
await(
  function(cb)
    source.add({
      slug = "s",
      repo = root,
      path = "src/a.lua",
      line = 42,
      end_line = 45,
      side = "old",
      type = "issue",
      content = "body with spaces",
    }, cb)
  end
)
local argv = vim.fn.readfile(argv_log)
assert(
  argv[#argv]
    == "review add --session s --repo "
      .. root
      .. " --target-file src/a.lua --line 42 --side old --end-line 45 --type issue body with spaces",
  "add argv, got: " .. argv[#argv]
)

-- 4. a file comment carries no line, and a review comment carries no target
await(function(cb) source.add({ slug = "s", path = "src/a.lua", content = "file wide" }, cb) end)
await(function(cb) source.add({ slug = "s", content = "summary" }, cb) end)
argv = vim.fn.readfile(argv_log)
assert(
  argv[#argv - 1] == "review add --session s --target-file src/a.lua file wide",
  "file argv, got: " .. argv[#argv - 1]
)
assert(argv[#argv] == "review add --session s summary", "review argv, got: " .. argv[#argv])

-- 5. delete names the comment id
await(function(cb) source.delete("s", "c1", root, cb) end)
argv = vim.fn.readfile(argv_log)
assert(argv[#argv] == "review delete --session s --comment-id c1 --repo " .. root, "delete argv, got: " .. argv[#argv])

-- 6. a failing tuicr reports its stderr instead of throwing
local failed = false
source.run({ "review", "bogus" }, function(_, err) failed = err ~= nil end)
vim.wait(2000, function() return failed end, 10)
assert(failed, "a bad subcommand must report an error")

-- 7. a fake gh, so PR detection never touches the real forge
local gh_log = dir .. "/gh-argv"
local gh = dir .. "/gh"
vim.fn.writefile({
  "#!/usr/bin/env bash",
  'printf "%s\\n" "$*" >> ' .. gh_log,
  '[[ -n "$GH_NO_PR" ]] && exit 1',
  "echo '{\"number\":123}'",
}, gh)
vim.fn.setfperm(gh, "rwxr-xr-x")

-- 8. an open PR at the branch tip scopes the review to that PR
local function scope_for(view)
  local done, scope = false, nil
  tuicr.scope_for(view, function(s)
    scope, done = s, true
  end)
  vim.wait(5000, function() return done end, 10)
  assert(done, "scope_for never answered")
  return scope
end
local function pane(rev) return { rev = rev, path = rel } end
local tip = vim.trim(vim.system({ "git", "-C", root, "rev-parse", "--verify", "HEAD" }):wait().stdout or "")

vim.env.GH_NO_PR = nil
assert(
  vim.inspect(scope_for({ root = root, path = rel, new = pane(tip), old = pane(base) })) == vim.inspect({ "pr", "123" }),
  "the tip with an open PR is a PR scope"
)
assert(
  vim.fn.readfile(gh_log)[1] == "pr view --json number",
  "gh argv, got: " .. table.concat(vim.fn.readfile(gh_log), " ")
)

-- without a PR the same diff is a commit range
vim.env.GH_NO_PR = "1"
assert(
  vim.inspect(scope_for({ root = root, path = rel, new = pane(tip), old = pane(base) }))
    == vim.inspect({ "-r", base .. ".." .. tip }),
  "no PR falls back to a range"
)
vim.env.GH_NO_PR = nil

-- an older commit is always a range, and never asks gh
local gh_before = #vim.fn.readfile(gh_log)
assert(
  vim.inspect(scope_for({ root = root, path = rel, new = pane(base), old = pane(twin) }))
    == vim.inspect({ "-r", twin .. ".." .. base }),
  "an old commit is a range"
)
assert(#vim.fn.readfile(gh_log) == gh_before, "a commit that is not the tip must not ask gh")

-- a working tree file is uncommitted work, and a lone pane is that commit
assert(
  vim.inspect(scope_for({ root = root, path = rel, new = { path = rel }, old = pane("HEAD") })) == vim.inspect({ "-w" }),
  "the working tree is -w"
)
assert(
  vim.inspect(scope_for({ root = root, path = rel, new = pane(twin) })) == vim.inspect({ "-r", twin .. "~1.." .. twin }),
  "an inline pane is that commit"
)
assert(scope_for({ root = root, path = rel, new = { path = rel } }) == nil, "an ordinary file pane has no scope")
assert(scope_for({ path = rel, new = pane(tip) }) == nil, "no root has no scope")

-- 7. pane discovery. Revision buffers are the old side, a plain file is the new
-- side, and CodeDiff's inline layout counts as new side only.
local function revision_buf(rev)
  local buf = vim.api.nvim_create_buf(false, true)
  vim.fn.bufload(buf)
  vim.api.nvim_buf_set_name(buf, "codediff://" .. root .. "///" .. rev .. "/" .. rel)
  return buf
end

---@param tabpage number
---@return number[] windows, left to right
local function tab_wins(tabpage)
  local wins = vim.api.nvim_tabpage_list_wins(tabpage)
  table.sort(wins, function(a, b) return vim.fn.win_screenpos(a)[2] < vim.fn.win_screenpos(b)[2] end)
  return wins
end

---@param order number[]
---@return number tabpage
local function panes(order)
  vim.cmd("tabnew")
  vim.cmd("vsplit")
  local tabpage = vim.api.nvim_get_current_tabpage()
  local wins = tab_wins(tabpage)
  assert(#wins == 2, "the fixture needs exactly two panes, got " .. #wins)
  for index, buf in ipairs(order) do
    vim.api.nvim_win_set_buf(wins[index], buf)
  end
  return tabpage
end

local old_buf, new_buf = revision_buf(base), vim.fn.bufadd(self_path)
vim.fn.bufload(new_buf)
local file_tab = panes({ old_buf, new_buf })
local view = tuicr.discover(file_tab)
assert(view ~= nil, "two panes must make a view")
assert(view.root == root, "root comes from the revision buffer, got " .. tostring(view.root))
assert(view.path == rel, "path is repo relative, got " .. tostring(view.path))
assert(view.old.buf == old_buf and view.old.rev == base, "the revision pane is the old side")
assert(view.new.buf == new_buf, "the working tree pane is the new side")

-- reversed window order must not swap the sides
local reversed = panes({ new_buf, revision_buf(tip) })
view = tuicr.discover(reversed)
assert(view.old.rev == tip and view.new.buf == new_buf, "sides follow the buffer kind, not the column")

-- two revisions: the left pane is the old side
local both = panes({ revision_buf(other), revision_buf(twin) })
view = tuicr.discover(both)
assert(view.old.rev == other, "left revision is the old side, got " .. tostring(view.old.rev))
assert(view.new.rev == twin, "right revision is the new side")
assert(view.path == rel, "both sides agree on the path")

-- one pane is the inline layout, which only shows the new side
vim.cmd("tabnew")
local inline_tab = vim.api.nvim_get_current_tabpage()
vim.api.nvim_win_set_buf(vim.api.nvim_get_current_win(), revision_buf(alone))
view = tuicr.discover(inline_tab)
assert(view.new.rev == alone and view.old == nil, "inline has a new side only")

-- a tab with no diff pane at all is not a view
vim.cmd("tabnew")
assert(tuicr.discover(vim.api.nvim_get_current_tabpage()) == nil, "an empty tab is not a view")

-- 9. autobind picks the session a diff is anchored to. A commit range is
-- anchored on its newest commit, so `fresh..head` finds the ranged session and
-- not the worktree one, which is anchored on a base this diff does not name.
-- `Snacks` is stubbed because rendering a binding installs keymaps.
_G.Snacks = { keymap = { set = function() end } }
local ranged_tab = panes({ revision_buf(fresh), revision_buf(head) })
tuicr.autobind(ranged_tab)
local wanted = "review comments --session shadowburst/.dotfiles@main/commits/aaa..bbb --repo " .. root
vim.wait(5000, function() return vim.tbl_contains(vim.fn.readfile(argv_log), wanted) end, 20)
assert(
  vim.tbl_contains(vim.fn.readfile(argv_log), wanted),
  "autobind must read the commit range session, got: " .. table.concat(vim.fn.readfile(argv_log), " / ")
)

vim.fn.delete(dir, "rf")
print("codediff-tuicr-source: all assertions passed")
