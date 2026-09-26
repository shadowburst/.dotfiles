---@brief Turns tuicr comments into CodeDiff virtual lines.
---
--- CodeDiff holds the whole file in both panes and pads them with extmark
--- virtual lines, so buffer row N is file line N on each side. A comment at
--- line 42 is therefore row 42 in the pane for its side, and the other pane
--- gets the same number of blank rows to keep the two aligned.
local M = {}

M.ns = vim.api.nvim_create_namespace("codediff_tuicr")

local hl = {
  anchor = "CodeDiffTuicrAnchor",
  author = "CodeDiffTuicrAuthor",
  body = "CodeDiffTuicrBody",
  more = "CodeDiffTuicrMore",
  pad = "CodeDiffTuicrPad",
}

---@class codediff_tuicr.Comment
---@field id string
---@field path? string
---@field start_line? number
---@field end_line? number
---@field side? string
---@field comment_type string
---@field author string
---@field lifecycle_state string
---@field content string

---@class codediff_tuicr.Thread
---@field key string
---@field side "new"|"old"
---@field row number 1-based buffer row the block is drawn under
---@field start_line? number
---@field end_line? number
---@field file_level boolean
---@field comments codediff_tuicr.Comment[]

---@class codediff_tuicr.Layout
---@field new table<number, table[]> blocks keyed by row
---@field old table<number, table[]>
---@field threads codediff_tuicr.Thread[]
---@field rows number[] every row carrying a block, ascending

function M.define_highlights()
  vim.api.nvim_set_hl(0, hl.anchor, { default = true, link = "Special" })
  vim.api.nvim_set_hl(0, hl.author, { default = true, link = "Function" })
  vim.api.nvim_set_hl(0, hl.body, { default = true, link = "Comment" })
  vim.api.nvim_set_hl(0, hl.more, { default = true, link = "NonText" })
  vim.api.nvim_set_hl(0, hl.pad, { default = true, link = "NonText" })
end

---@param text string
---@return string
local function headline(text) return vim.trim(vim.split(vim.trim(text or ""), "\n")[1] or "") end

--- JSON nulls decode to `vim.NIL`, which is truthy, so numbers are checked.
---@param value any
---@return number?
local function num(value) return type(value) == "number" and value or nil end

---@param thread codediff_tuicr.Thread
---@return string
local function anchor(thread)
  if thread.file_level then
    return "file"
  end
  if thread.start_line ~= thread.end_line then
    return thread.start_line .. "-" .. thread.end_line
  end
  return tostring(thread.end_line)
end

--- Comments for one file, grouped into one thread per anchor, ordered by row.
--- Review-level comments (no path) are not file comments and are left out.
---@param comments codediff_tuicr.Comment[]
---@param path string
---@return codediff_tuicr.Thread[]
function M.threads(comments, path)
  local by_key, ordered = {}, {}
  for _, comment in ipairs(comments) do
    if comment.path == path then
      local line = num(comment.start_line)
      local end_line = num(comment.end_line) or line
      local side = comment.side == "old" and "old" or "new"
      local row = end_line or 1
      local key = (line and (side .. ":" .. row) or "file") .. ":" .. tostring(row)
      local thread = by_key[key]
      if not thread then
        thread = {
          key = key,
          side = side,
          row = row,
          start_line = line,
          end_line = end_line,
          file_level = line == nil,
          comments = {},
        }
        by_key[key] = thread
        ordered[#ordered + 1] = thread
      end
      thread.comments[#thread.comments + 1] = comment
    end
  end
  table.sort(ordered, function(a, b)
    if a.row ~= b.row then
      return a.row < b.row
    end
    return a.side < b.side
  end)
  return ordered
end

--- The virtual rows a thread draws under its anchor row.
---@param thread codediff_tuicr.Thread
---@param opts { max_rows: number, is_expanded: fun(thread: codediff_tuicr.Thread): boolean }
---@return table[] one entry per row, each a list of { text, hl } chunks
function M.block(thread, opts)
  local count, rows = #thread.comments, {}
  local label = anchor(thread)
  local root = thread.comments[1]
  if count > opts.max_rows and not opts.is_expanded(thread) then
    return {
      {
        { "▸ " .. count .. " · " .. label, hl.anchor },
        { " " .. root.author, hl.author },
        { " · " .. root.comment_type, hl.anchor },
        { " " .. headline(root.content), hl.body },
      },
    }
  end
  for index = 1, math.min(count, opts.max_rows) do
    local comment = thread.comments[index]
    local position = count > 1 and ("┃ " .. index .. "/" .. count .. " ") or "┃ "
    rows[#rows + 1] = {
      { position .. label, hl.anchor },
      { " " .. comment.author, hl.author },
      { " · " .. comment.comment_type, hl.anchor },
      { " " .. headline(comment.content), hl.body },
    }
  end
  if count > opts.max_rows then
    rows[#rows + 1] = { { "+" .. (count - opts.max_rows) .. " more · K for the thread", hl.more } }
  end
  return rows
end

---@param comments codediff_tuicr.Comment[]
---@param path string
---@param opts { max_rows: number, is_expanded: fun(thread: codediff_tuicr.Thread): boolean }
---@return codediff_tuicr.Layout
function M.build(comments, path, opts)
  local threads = M.threads(comments, path)
  local layout = { new = {}, old = {}, threads = threads, rows = {} }
  local seen = {}
  for _, thread in ipairs(threads) do
    layout[thread.side][thread.row] = M.block(thread, opts)
    if not seen[thread.row] then
      seen[thread.row] = true
      layout.rows[#layout.rows + 1] = thread.row
    end
  end
  table.sort(layout.rows)
  return layout
end

---@param layout codediff_tuicr.Layout
---@param side "new"|"old"
---@param row number
---@return number
local function height(layout, side, row) return #(layout[side][row] or {}) end

---@param buf number?
function M.clear(buf)
  if buf and vim.api.nvim_buf_is_valid(buf) then
    vim.api.nvim_buf_clear_namespace(buf, M.ns, 0, -1)
  end
end

--- Draw every block. Both panes get the same number of rows per anchor: the pane
--- that owns the block draws it, the other one draws blanks.
---@param bufs { new: number?, old: number? }
---@param layout codediff_tuicr.Layout
function M.apply(bufs, layout)
  M.clear(bufs.new)
  M.clear(bufs.old)
  for _, side in ipairs({ "new", "old" }) do
    local buf = bufs[side]
    if buf and vim.api.nvim_buf_is_valid(buf) then
      local lines = vim.api.nvim_buf_line_count(buf)
      for _, row in ipairs(layout.rows) do
        if row <= lines then
          local rows = vim.deepcopy(layout[side][row] or {})
          local total = math.max(height(layout, "new", row), height(layout, "old", row))
          for index = #rows + 1, total do
            rows[index] = { { "", hl.pad } }
          end
          if #rows > 0 then
            vim.api.nvim_buf_set_extmark(buf, M.ns, row - 1, 0, { virt_lines = rows })
          end
        end
      end
    end
  end
end

---@param layout codediff_tuicr.Layout
---@param side "new"|"old"
---@param row number
---@return codediff_tuicr.Thread?
function M.thread_at(layout, side, row)
  for _, thread in ipairs(layout.threads) do
    if thread.row == row and thread.side == side then
      return thread
    end
  end
end

---@param buf number
---@param ns number
---@return table<number, number> rows carrying virtual lines -> count
local function virt_rows(buf, ns)
  local counts = {}
  for _, mark in ipairs(vim.api.nvim_buf_get_extmarks(buf, ns, 0, -1, { details = true })) do
    local details = mark[4] or {}
    local count = #(details.virt_lines or {})
    if count > 0 then
      -- The 1-based line the block is drawn under, matching CodeDiff's own filler math.
      local row = details.virt_lines_above and mark[2] or mark[2] + 1
      counts[row] = count
    end
  end
  return counts
end

M.virt_rows = virt_rows

--- The full thread in a float.
---@param thread codediff_tuicr.Thread
---@return number win
function M.thread_float(thread)
  local lines =
    { "# " .. anchor(thread) .. " · " .. thread.side .. " side · " .. #thread.comments .. " comment(s)", "" }
  for index, comment in ipairs(thread.comments) do
    lines[#lines + 1] = "["
      .. index
      .. "] "
      .. comment.author
      .. " · "
      .. comment.comment_type
      .. " · "
      .. comment.lifecycle_state
    vim.list_extend(lines, vim.split(comment.content or "", "\n"))
    lines[#lines + 1] = ""
  end
  lines[#lines + 1] = "id: " .. table.concat(vim.tbl_map(function(comment) return comment.id end, thread.comments), " ")

  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  vim.bo[buf].filetype = "markdown"
  vim.bo[buf].modifiable = false
  vim.bo[buf].bufhidden = "wipe"

  local width = math.min(100, math.max(40, vim.o.columns - 8))
  local height = math.min(#lines, math.max(8, vim.o.lines - 8))
  local win = vim.api.nvim_open_win(buf, false, {
    relative = "editor",
    row = math.max(0, math.floor((vim.o.lines - height) / 2) - 1),
    col = math.floor((vim.o.columns - width) / 2),
    width = width,
    height = height,
    style = "minimal",
    border = "rounded",
    title = " tuicr ",
    title_pos = "center",
  })
  vim.wo[win].wrap = true
  vim.wo[win].cursorline = true
  return win
end

--- Review-level comments have no file, so they get a float of their own.
---@param comments codediff_tuicr.Comment[]
---@return number win
function M.notes_float(comments)
  local notes = vim.tbl_filter(function(comment) return not comment.path end, comments)
  local lines = {}
  if #notes == 0 then
    lines = { "# no review-level comments in this session" }
  end
  for index, comment in ipairs(notes) do
    lines[#lines + 1] = "## [" .. index .. "] " .. comment.author .. " · " .. comment.comment_type
    vim.list_extend(lines, vim.split(comment.content or "", "\n"))
    lines[#lines + 1] = ""
  end

  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  vim.bo[buf].filetype = "markdown"
  vim.bo[buf].modifiable = false
  vim.bo[buf].bufhidden = "wipe"

  local width = math.min(100, math.max(40, vim.o.columns - 8))
  local height = math.min(#lines, math.max(8, vim.o.lines - 8))
  local win = vim.api.nvim_open_win(buf, false, {
    relative = "editor",
    row = math.max(0, math.floor((vim.o.lines - height) / 2) - 1),
    col = math.floor((vim.o.columns - width) / 2),
    width = width,
    height = height,
    style = "minimal",
    border = "rounded",
    title = " review notes ",
    title_pos = "center",
  })
  vim.wo[win].wrap = true
  return win
end

return M
