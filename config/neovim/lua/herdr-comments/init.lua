local M = {}

local namespace = vim.api.nvim_create_namespace("herdr-comments")
local state_file = vim.g.herdr_comments_state_file or (vim.fn.stdpath("state") .. "/herdr-comments.json")
local comments = {}
local next_id = 1
local state_corrupt = false

local function notify(message, level) vim.notify("herdr-comments: " .. message, level or vim.log.levels.INFO) end

local function neogit_path(path) return path:match("^neogit:/+[^/]+/(.+)$") end

local function location_for_buf(buf)
  local file = vim.api.nvim_buf_get_name(buf)
  if file == "" then
    return nil
  end
  local root = vim.fs.root(file, ".git")
  if not root then
    return nil
  end
  return root, neogit_path(file) or vim.fs.relpath(root, file)
end

local function repo_for_buf(buf) return location_for_buf(buf) end

local function file_for(comment) return vim.fs.joinpath(comment.root, comment.path) end

local function detach(comment)
  if comment.buf and vim.api.nvim_buf_is_valid(comment.buf) then
    if comment.mark then
      vim.api.nvim_buf_del_extmark(comment.buf, namespace, comment.mark)
    end
    for _, mark in ipairs(comment.bars or {}) do
      vim.api.nvim_buf_del_extmark(comment.buf, namespace, mark)
    end
  end
  comment.buf, comment.mark, comment.bars = nil, nil, nil
end

local function sync_comment(comment)
  if not comment.buf or not comment.mark or not vim.api.nvim_buf_is_valid(comment.buf) then
    return false
  end
  local mark = vim.api.nvim_buf_get_extmark_by_id(comment.buf, namespace, comment.mark, { details = true })
  if #mark == 0 or mark[3].invalid then
    detach(comment)
    return false
  end
  comment.start_line = mark[1] + 1
  comment.end_line = math.max(comment.start_line, mark[3].end_row or comment.start_line)
  return true
end

local function sync_marks()
  for _, comment in pairs(comments) do
    sync_comment(comment)
  end
end

local function persist(changed)
  if state_corrupt and not changed then
    return
  end
  sync_marks()
  local repos = {}
  for _, comment in pairs(comments) do
    repos[comment.root] = repos[comment.root] or {}
    repos[comment.root][#repos[comment.root] + 1] = {
      id = comment.id,
      path = comment.path,
      start_line = comment.start_line,
      end_line = comment.end_line,
      text = comment.text,
    }
  end
  for _, repo_comments in pairs(repos) do
    table.sort(repo_comments, function(a, b) return a.id < b.id end)
  end

  vim.fn.mkdir(vim.fs.dirname(state_file), "p")
  local temporary = state_file .. ".tmp." .. vim.uv.os_getpid()
  local ok, err = pcall(function()
    if
      vim.fn.writefile({ vim.json.encode({ version = 1, next_id = next_id, repos = repos }) }, temporary, "b") ~= 0
    then
      error("could not write " .. temporary)
    end
    local renamed, rename_err = vim.uv.fs_rename(temporary, state_file)
    if not renamed then
      error(rename_err)
    end
  end)
  if not ok then
    vim.uv.fs_unlink(temporary)
    notify("could not save comments: " .. tostring(err), vim.log.levels.ERROR)
  else
    state_corrupt = false
  end
end

local function valid_record(root, record)
  return type(root) == "string"
    and type(record) == "table"
    and type(record.id) == "number"
    and type(record.path) == "string"
    and type(record.start_line) == "number"
    and type(record.end_line) == "number"
    and record.start_line >= 1
    and record.end_line >= record.start_line
    and type(record.text) == "string"
end

local function load_state()
  if vim.fn.filereadable(state_file) == 0 then
    return
  end
  local ok, decoded = pcall(vim.json.decode, table.concat(vim.fn.readfile(state_file, "b"), "\n"))
  if not ok or type(decoded) ~= "table" or type(decoded.repos) ~= "table" then
    state_corrupt = true
    notify("could not read saved comments; the state file will be replaced on the next change", vim.log.levels.ERROR)
    return
  end
  for root, repo_comments in pairs(decoded.repos) do
    if type(repo_comments) == "table" then
      for _, record in ipairs(repo_comments) do
        if valid_record(root, record) and not comments[record.id] then
          comments[record.id] = {
            id = record.id,
            root = root,
            path = neogit_path(record.path) or record.path,
            start_line = record.start_line,
            end_line = record.end_line,
            text = record.text,
          }
          next_id = math.max(next_id, record.id + 1)
        end
      end
    end
  end
  if type(decoded.next_id) == "number" then
    next_id = math.max(next_id, decoded.next_id)
  end
end

local function render(comment, buf)
  local line_count = vim.api.nvim_buf_line_count(buf)
  if comment.start_line > line_count or comment.end_line > line_count then
    return false
  end
  detach(comment)
  local mark = vim.api.nvim_buf_set_extmark(buf, namespace, comment.start_line - 1, 0, {
    end_row = comment.end_line,
    end_col = 0,
    right_gravity = false,
    end_right_gravity = true,
    hl_group = "CursorLine",
    hl_eol = true,
    virt_lines = { { { "╭─ ", "DiagnosticInfo" }, { "💬 " .. comment.text, "DiagnosticInfo" } } },
    virt_lines_above = true,
  })
  local bars = {}
  for line = comment.start_line, comment.end_line do
    bars[#bars + 1] = vim.api.nvim_buf_set_extmark(buf, namespace, line - 1, 0, {
      sign_text = "▌",
      sign_hl_group = "DiagnosticInfo",
      right_gravity = false,
    })
  end
  comment.buf, comment.mark, comment.bars = buf, mark, bars
  return true
end

local function hydrate(buf)
  local root, path = location_for_buf(buf)
  if not root then
    return
  end
  for _, comment in pairs(comments) do
    if comment.root == root and comment.path == path then
      local attached = sync_comment(comment)
      if not attached or comment.buf ~= buf then
        -- ponytail: render one view at a time; keep per-buffer marks if simultaneous views matter.
        render(comment, buf)
      end
    end
  end
end

local function snapshot(comment)
  local attached = sync_comment(comment)
  local file = file_for(comment)
  local ok, lines = pcall(vim.fn.readfile, file)
  return {
    id = comment.id,
    buf = attached and comment.buf or nil,
    root = comment.root,
    file = file,
    path = comment.path,
    start_line = comment.start_line,
    end_line = comment.end_line,
    text = comment.text,
    stale = not ok or (not attached and comment.end_line > #lines),
  }
end

local function list(root)
  sync_marks()
  local result = {}
  for _, stored in pairs(comments) do
    if not root or stored.root == root then
      result[#result + 1] = snapshot(stored)
    end
  end
  table.sort(result, function(a, b) return a.path == b.path and a.start_line < b.start_line or a.path < b.path end)
  return result
end

local function location(comment)
  if comment.start_line == comment.end_line then
    return string.format("%s:%d", comment.path, comment.start_line)
  end
  return string.format("%s:%d-%d", comment.path, comment.start_line, comment.end_line)
end

function M.add(buf, start_line, end_line, text)
  local root, path = location_for_buf(buf)
  if not root then
    notify("comments require a named file inside a Git repository", vim.log.levels.ERROR)
    return
  end

  local id = next_id
  next_id = next_id + 1
  local comment = {
    id = id,
    root = root,
    path = path,
    start_line = start_line,
    end_line = end_line,
    text = text,
  }
  comments[id] = comment
  render(comment, buf)
  persist(true)
end

local function current_repo()
  local root = repo_for_buf(0) or vim.fs.root(vim.fn.getcwd(), ".git")
  if not root then
    notify("this action requires a named file inside a Git repository", vim.log.levels.ERROR)
  end
  return root
end

local function add_range(start_line, end_line)
  local buf = vim.api.nvim_get_current_buf()
  if not repo_for_buf(buf) then
    notify("comments require a named file inside a Git repository", vim.log.levels.ERROR)
    return
  end
  vim.api.nvim_win_set_cursor(0, { math.min(start_line, end_line), 0 })
  Snacks.input({
    prompt = "Comment",
    win = { relative = "cursor", row = -3, col = 0 },
  }, function(text)
    if text and text ~= "" and vim.api.nvim_buf_is_valid(buf) then
      M.add(buf, math.min(start_line, end_line), math.max(start_line, end_line), text)
    end
  end)
end

function M.comment_line()
  local line = vim.api.nvim_win_get_cursor(0)[1]
  add_range(line, line)
end

function M.comment_selection() add_range(vim.fn.line("v"), vim.fn.line(".")) end

function M.pick_comments()
  local root = current_repo()
  if not root then
    return
  end
  persist()
  local repo_comments = list(root)
  if #repo_comments == 0 then
    notify("no comments in this repository")
    return
  end

  local items = {}
  for _, comment in ipairs(repo_comments) do
    items[#items + 1] = {
      text = location(comment) .. " " .. comment.text,
      file = comment.file,
      pos = { comment.start_line, 0 },
      location = location(comment),
      comment = comment,
    }
  end
  Snacks.picker({
    title = "Code comments",
    items = items,
    format = function(item)
      return {
        { item.comment.stale and "⚠ " or "💬 ", item.comment.stale and "DiagnosticWarn" or "DiagnosticInfo" },
        { item.location, "SnacksPickerFile" },
        { "  " .. item.comment.text, "String" },
        { item.comment.stale and "  stale" or "", "DiagnosticWarn" },
      }
    end,
    preview = "file",
    confirm = "jump",
  })
end

local function remove(id)
  local comment = comments[id]
  if comment then
    detach(comment)
    comments[id] = nil
  end
end

local function clear(selected)
  for _, comment in ipairs(selected) do
    remove(comment.id)
  end
  persist(true)
end

function M.clear_file()
  local root = current_repo()
  if not root then
    return
  end
  local _, path = location_for_buf(0)
  local selected = vim.tbl_filter(function(comment) return comment.path == path end, list(root))
  clear(selected)
  notify(string.format("cleared %d comment(s) from this file", #selected))
end

function M.clear_repo()
  local root = current_repo()
  if not root then
    return
  end
  local selected = list(root)
  if #selected == 0 then
    notify("no comments in this repository")
    return
  end
  if vim.fn.confirm(string.format("Clear %d repository comment(s)?", #selected), "&Clear\n&Cancel", 2) == 1 then
    clear(selected)
    notify(string.format("cleared %d repository comment(s)", #selected))
  end
end

local function format_payload(selected)
  local lines = { "Please address each comment:" }
  for _, comment in ipairs(selected) do
    lines[#lines + 1] = string.format("%s — %s", location(comment), comment.text)
  end
  return table.concat(lines, "\n")
end

local function agents()
  if vim.env.HERDR_ENV ~= "1" or not vim.env.HERDR_WORKSPACE_ID then
    return nil, "delivery requires Neovim to run inside a Herdr workspace"
  end
  local result = vim.system({ "herdr", "agent", "list" }, { text = true }):wait()
  if result.code ~= 0 then
    return nil, "herdr agent list failed: " .. vim.trim(result.stderr or "")
  end
  local ok, decoded = pcall(vim.json.decode, result.stdout or "")
  if not ok or type(decoded) ~= "table" then
    return nil, "herdr agent list returned invalid JSON"
  end

  local found = {}
  for _, agent in ipairs((decoded.result or {}).agents or {}) do
    if agent.workspace_id == vim.env.HERDR_WORKSPACE_ID then
      agent.target = agent.name or agent.pane_id
      agent.cwd = agent.foreground_cwd or agent.cwd or ""
      agent.status = agent.agent_status or "unknown"
      agent.label = agent.name or agent.terminal_title or agent.agent or agent.pane_id
      agent.text = string.format("%s %s %s %s", agent.label, agent.agent or "agent", agent.status, agent.cwd)
      found[#found + 1] = agent
    end
  end
  table.sort(found, function(a, b) return a.label < b.label end)
  return found
end

local function pick_agent(found, callback)
  if #found == 0 then
    notify("no coding agents found in this Herdr workspace", vim.log.levels.ERROR)
  elseif #found == 1 then
    callback(found[1])
  else
    local items = {}
    for _, agent in ipairs(found) do
      items[#items + 1] = { text = agent.text, agent = agent }
    end
    Snacks.picker({
      title = "Herdr agent",
      items = items,
      layout = { preset = "select" },
      preview = "none",
      format = function(item)
        local agent = item.agent
        return {
          { agent.label, "SnacksPickerLabel" },
          { "  " .. (agent.agent or "agent") },
          { "  " .. agent.status, agent.status == "working" and "DiagnosticWarn" or "Comment" },
          { "  " .. agent.cwd, "Comment" },
        }
      end,
      confirm = function(picker, item)
        picker:close()
        if item then
          vim.schedule(function() callback(item.agent) end)
        end
      end,
    })
  end
end

local function deliver(submit)
  local root = current_repo()
  if not root then
    return
  end
  persist()
  local selected = list(root)
  if #selected == 0 then
    notify("no comments in this repository")
    return
  end
  for _, comment in ipairs(selected) do
    if comment.buf and vim.bo[comment.buf].modified then
      notify("save all commented buffers before delivery", vim.log.levels.ERROR)
      return
    end
  end
  local sendable = vim.tbl_filter(function(comment) return not comment.stale end, selected)
  if #sendable == 0 then
    clear(selected)
    notify(string.format("cleared %d stale comment(s)", #selected))
    return
  end

  local found, err = agents()
  if not found then
    notify(err, vim.log.levels.ERROR)
    return
  end
  pick_agent(found, function(agent)
    if agent.status == "working" then
      notify(agent.label .. " is working; sending anyway", vim.log.levels.WARN)
    end
    local payload = format_payload(sendable)
    local command = submit and { "herdr", "agent", "prompt", agent.target, payload }
      or { "herdr", "pane", "send-text", agent.pane_id, payload }
    local result = vim.system(command, { text = true }):wait()
    if result.code ~= 0 then
      notify("delivery failed: " .. vim.trim(result.stderr or ""), vim.log.levels.ERROR)
      return
    end
    clear(selected)
    notify(string.format("sent %d comment(s) to %s", #sendable, agent.label))
  end)
end

function M.append() deliver(false) end

function M.submit() deliver(true) end

load_state()

local group = vim.api.nvim_create_augroup("herdr-comments", { clear = true })
vim.api.nvim_create_autocmd({ "BufReadPost", "BufEnter" }, {
  group = group,
  callback = function(event) hydrate(event.buf) end,
})
vim.api.nvim_create_autocmd("BufWritePost", {
  group = group,
  callback = function(event)
    hydrate(event.buf)
    persist()
  end,
})
vim.api.nvim_create_autocmd("BufWipeout", {
  group = group,
  callback = function(event)
    for _, comment in pairs(comments) do
      if comment.buf == event.buf then
        comment.buf, comment.mark, comment.bars = nil, nil, nil
      end
    end
  end,
})
vim.api.nvim_create_autocmd("VimLeavePre", { group = group, callback = persist })
for _, buf in ipairs(vim.api.nvim_list_bufs()) do
  if vim.api.nvim_buf_is_loaded(buf) then
    hydrate(buf)
  end
end

return M
