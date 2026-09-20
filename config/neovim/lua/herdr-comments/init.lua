local M = {}

local namespace = vim.api.nvim_create_namespace("herdr-comments")
local comments = {}
local next_id = 1

local function notify(message, level) vim.notify("herdr-comments: " .. message, level or vim.log.levels.INFO) end

local function repo_for_buf(buf)
  local file = vim.api.nvim_buf_get_name(buf)
  if file == "" then
    return nil
  end
  return vim.fs.root(file, ".git")
end

local function resolve(id)
  local stored = comments[id]
  if not stored or not vim.api.nvim_buf_is_valid(stored.buf) then
    return nil
  end

  local mark = vim.api.nvim_buf_get_extmark_by_id(stored.buf, namespace, stored.mark, { details = true })
  if #mark == 0 or mark[3].invalid then
    return nil
  end

  local file = vim.api.nvim_buf_get_name(stored.buf)
  local path = vim.fs.relpath(stored.root, file)
  if not path then
    return nil
  end

  local start_line = mark[1] + 1
  local end_line = math.max(start_line, mark[3].end_row or start_line)
  return {
    id = id,
    buf = stored.buf,
    root = stored.root,
    file = file,
    path = path,
    start_line = start_line,
    end_line = end_line,
    text = stored.text,
  }
end

local function remove(id)
  local stored = comments[id]
  if not stored then
    return
  end
  if vim.api.nvim_buf_is_valid(stored.buf) then
    vim.api.nvim_buf_del_extmark(stored.buf, namespace, stored.mark)
    for _, mark in ipairs(stored.bars) do
      vim.api.nvim_buf_del_extmark(stored.buf, namespace, mark)
    end
  end
  comments[id] = nil
end

local function list(root)
  local result = {}
  for id in pairs(comments) do
    local comment = resolve(id)
    if comment and (not root or comment.root == root) then
      result[#result + 1] = comment
    elseif not comment then
      remove(id)
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
  local root = repo_for_buf(buf)
  if not root then
    notify("comments require a named file inside a Git repository", vim.log.levels.ERROR)
    return
  end

  local id = next_id
  next_id = next_id + 1
  local mark = vim.api.nvim_buf_set_extmark(buf, namespace, start_line - 1, 0, {
    end_row = end_line,
    end_col = 0,
    right_gravity = false,
    end_right_gravity = true,
    hl_group = "CursorLine",
    hl_eol = true,
    virt_lines = { { { "╭─ ", "DiagnosticInfo" }, { "💬 " .. text, "DiagnosticInfo" } } },
    virt_lines_above = true,
  })
  local bars = {}
  for line = start_line, end_line do
    bars[#bars + 1] = vim.api.nvim_buf_set_extmark(buf, namespace, line - 1, 0, {
      sign_text = "▌",
      sign_hl_group = "DiagnosticInfo",
      right_gravity = false,
    })
  end
  comments[id] = { buf = buf, root = root, mark = mark, bars = bars, text = text }
end

local function current_repo()
  local root = repo_for_buf(0)
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
        { "💬 ", "DiagnosticInfo" },
        { item.location, "SnacksPickerFile" },
        { "  " .. item.comment.text, "String" },
      }
    end,
    preview = "file",
    confirm = "jump",
  })
end

local function clear(selected)
  for _, comment in ipairs(selected) do
    remove(comment.id)
  end
end

function M.clear_file()
  local root = current_repo()
  if not root then
    return
  end
  local file = vim.api.nvim_buf_get_name(0)
  local selected = vim.tbl_filter(function(comment) return comment.file == file end, list(root))
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
  local selected = list(root)
  if #selected == 0 then
    notify("no comments in this repository")
    return
  end
  for _, comment in ipairs(selected) do
    if vim.bo[comment.buf].modified then
      notify("save all commented buffers before delivery", vim.log.levels.ERROR)
      return
    end
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
    local payload = format_payload(selected)
    local command = submit and { "herdr", "agent", "prompt", agent.target, payload }
      or { "herdr", "pane", "send-text", agent.pane_id, payload }
    local result = vim.system(command, { text = true }):wait()
    if result.code ~= 0 then
      notify("delivery failed: " .. vim.trim(result.stderr or ""), vim.log.levels.ERROR)
      return
    end
    clear(selected)
    notify(string.format("sent %d comment(s) to %s", #selected, agent.label))
  end)
end

function M.append() deliver(false) end

function M.submit() deliver(true) end

return M
