---@brief Turns pull request review comments into CodeDiff virtual lines.
---
--- CodeDiff holds the whole file in both panes and pads them with extmark
--- virtual lines, so buffer row N is file line N on each side. A comment at
--- line 42 is therefore row 42 in the pane for its side, and the other pane
--- gets the same number of blank rows to keep the two aligned.
local M = {}

M.ns = vim.api.nvim_create_namespace("codediff_pr")

local hl = {
  anchor = "CodeDiffPrAnchor",
  border = "CodeDiffPrBorder",
  user = "CodeDiffPrUser",
  date = "CodeDiffPrDate",
  assoc = "CodeDiffPrAssoc",
  author_badge = "CodeDiffPrAuthorBadge",
  body = "CodeDiffPrBody",
  more = "CodeDiffPrMore",
  pad = "CodeDiffPrPad",
  pending = "CodeDiffPrPending",
  resolved = "CodeDiffPrResolved",
}

--- Snacks' own account glyph, so a header here reads the same as one in
--- `Snacks pr`.
local ICON_USER = "\u{F2BD} "
local BOX_MIN = 50 --- the width Snacks gives its annotation boxes
local BOX_MAX = 160

-- Snacks' badge and relative-time helpers, resolved once Snacks is up. Without
-- them the box still draws, just without the rounded author badge, which is
-- what lets this layer run under `nvim -u NONE` in the test.
local badge = function(text) return { { text, hl.user } } end
local reltime = function(seconds) return tostring(seconds) end
local function title(text) return text end

---@class codediff_pr.Comment
---@field id string
---@field database_id? string
---@field path? string
---@field start_line? number
---@field end_line? number
---@field side? "new"|"old"
---@field author string
---@field content string
---@field created? number epoch seconds
---@field association? string
---@field resolved boolean
---@field outdated boolean
---@field deletable boolean
---@field pending? boolean drawn, but not submitted to GitHub yet

---@class codediff_pr.Thread
---@field key string
---@field side "new"|"old"
---@field row number 1-based buffer row the block is drawn under
---@field start_line? number
---@field end_line? number
---@field file_level boolean
---@field resolved boolean
---@field outdated boolean
---@field pending boolean
---@field comments codediff_pr.Comment[]

---@class codediff_pr.Layout
---@field new table<number, table[]> blocks keyed by row
---@field old table<number, table[]>
---@field threads codediff_pr.Thread[]
---@field rows number[] every row carrying a block, ascending

function M.define_highlights()
  vim.api.nvim_set_hl(0, hl.anchor, { default = true, link = "Special" })
  vim.api.nvim_set_hl(0, hl.border, { default = true, link = "FloatBorder" })
  vim.api.nvim_set_hl(0, hl.user, { default = true, link = "Directory" })
  vim.api.nvim_set_hl(0, hl.date, { default = true, link = "Comment" })
  vim.api.nvim_set_hl(0, hl.assoc, { default = true, link = "Special" })
  vim.api.nvim_set_hl(0, hl.author_badge, { default = true, link = "Constant" })
  vim.api.nvim_set_hl(0, hl.body, { default = true, link = "Comment" })
  vim.api.nvim_set_hl(0, hl.more, { default = true, link = "NonText" })
  vim.api.nvim_set_hl(0, hl.pad, { default = true, link = "NonText" })
  vim.api.nvim_set_hl(0, hl.pending, { default = true, link = "WarningMsg" })
  vim.api.nvim_set_hl(0, hl.resolved, { default = true, link = "NonText" })

  local H = Snacks and Snacks.picker.highlight
  local U = Snacks and Snacks.picker.util
  if H and H.badge then
    -- Snacks' badge chunks carry an `inline` key for virt_text; virt_lines takes
    -- { text, hl } only, and rejects anything wider.
    badge = function(text, color)
      return vim.tbl_map(function(chunk) return { chunk[1], chunk[2] } end, H.badge(text, color))
    end
  end
  if U and U.reltime then
    reltime = U.reltime
  end
  if U and U.title then
    title = U.title
  end
end

---@param text string
---@return string
local function headline(text) return vim.trim(vim.split(vim.trim(text or ""), "\n")[1] or "") end

--- Display width of a virt_lines row. Unlike Snacks' `H.offset`, every chunk
--- here is real text: the rounded ends of a badge each take a column.
---@param line table[]
---@return number
local function row_width(line)
  local total = 0
  for _, chunk in ipairs(line) do
    total = total + vim.api.nvim_strwidth(chunk[1])
  end
  return total
end

--- `│ content │`, padded so every row of a box closes on the same column.
---@param line table[]
---@param width number
---@return table[]
local function boxed(line, width)
  local row = { { "│ ", hl.border } }
  vim.list_extend(row, line)
  row[#row + 1] = { string.rep(" ", math.max(1, width - row_width(line) + 1)) .. "│", hl.border }
  return row
end

--- JSON nulls decode to `vim.NIL`, which is truthy, so numbers are checked.
---@param value any
---@return number?
local function num(value) return type(value) == "number" and value or nil end

---@param thread codediff_pr.Thread
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
--- Review-level bodies have no file and are left out.
---@param comments codediff_pr.Comment[]
---@param path string
---@return codediff_pr.Thread[]
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
          resolved = comment.resolved or false,
          outdated = comment.outdated or false,
          pending = comment.pending or false,
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

--- Who said it, how long ago, how they stand in relation to the pull request,
--- and the first line of what they said -- the same header Snacks puts on a
--- review comment, minus the reactions this plugin never asks for.
---@param thread codediff_pr.Thread
---@param comment codediff_pr.Comment
---@param opts { pr_author: string? }
---@return table[]
local function comment_row(thread, comment, opts)
  local row = {}
  vim.list_extend(row, badge(ICON_USER .. " " .. comment.author, hl.user))
  if comment.created then
    row[#row + 1] = { " " }
    row[#row + 1] = { reltime(comment.created), hl.date }
  end
  local is_author = opts.pr_author ~= nil and opts.pr_author == comment.author
  local assoc = is_author and "Author" or comment.association
  if assoc and assoc ~= "" and assoc ~= "NONE" then
    row[#row + 1] = { " " }
    vim.list_extend(row, badge(title(assoc:lower()), is_author and hl.author_badge or hl.assoc))
  end

  -- The line is obvious from where the box sits, so it is only spelled out
  -- when the anchor is a range or the whole file.
  local where = thread.file_level and "file" or nil
  if not where and thread.start_line ~= thread.end_line then
    where = thread.start_line .. "-" .. thread.end_line
  end

  -- A resolved thread and one still waiting to be sent both read as settled
  -- rather than as something to act on, so they are drawn muted.
  local tone = thread.resolved and hl.resolved or (thread.pending and hl.pending or hl.body)
  local body = headline(comment.content)
  local room = math.max(8, math.min(vim.o.columns - 8, BOX_MAX) - row_width(row) - 3)
  if vim.api.nvim_strwidth(body) > room then
    body = vim.fn.strcharpart(body, 0, math.max(1, room - 1)) .. "…"
  end
  row[#row + 1] = { " " .. (where and (where .. "  ") or "") .. body, tone }
  return row
end

--- The virtual rows a thread draws under its anchor row: a box around the
--- comments and nothing around it -- the shape Snacks gives an inline review
--- comment in a diff, rounded like every other border in the config.
---@param thread codediff_pr.Thread
---@param opts { max_rows: number, is_expanded: fun(thread: codediff_pr.Thread): boolean, pr_author: string? }
---@return table[] one entry per row, each a list of { text, hl } chunks
function M.block(thread, opts)
  local count = #thread.comments
  local collapsed = count > opts.max_rows and not opts.is_expanded(thread)

  local content = {}
  for index, comment in ipairs(thread.comments) do
    if collapsed and index > 1 then
      break
    end
    content[#content + 1] = comment_row(thread, comment, opts)
  end
  if collapsed then
    content[#content + 1] = { { "+" .. (count - opts.max_rows) .. " more · K for the thread", hl.more } }
  end

  local width = BOX_MIN
  for _, row in ipairs(content) do
    width = math.max(width, math.min(row_width(row), BOX_MAX))
  end

  local rule = string.rep("─", width + 2)
  local rows = {
    { { "╭" .. rule .. "╮", hl.border } },
  }
  for _, row in ipairs(content) do
    rows[#rows + 1] = boxed(row, width)
  end
  rows[#rows + 1] = { { "╰" .. rule .. "╯", hl.border } }
  return rows
end

---@param comments codediff_pr.Comment[]
---@param path string
---@param opts { max_rows: number, is_expanded: fun(thread: codediff_pr.Thread): boolean, pr_author: string? }
---@return codediff_pr.Layout
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

---@param layout codediff_pr.Layout
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
---@param layout codediff_pr.Layout
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

---@param layout codediff_pr.Layout
---@param side "new"|"old"
---@param row number
---@return codediff_pr.Thread?
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

--- A scratch float with wrapped prose in it.
---@param lines string[]
---@param heading string
---@return number win
local function float(lines, heading)
  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  vim.bo[buf].filetype = "markdown"
  vim.bo[buf].modifiable = false
  vim.bo[buf].bufhidden = "wipe"

  local width = math.min(100, math.max(40, vim.o.columns - 8))
  local tall = math.min(#lines, math.max(8, vim.o.lines - 8))
  local win = vim.api.nvim_open_win(buf, false, {
    relative = "editor",
    row = math.max(0, math.floor((vim.o.lines - tall) / 2) - 1),
    col = math.floor((vim.o.columns - width) / 2),
    width = width,
    height = tall,
    style = "minimal",
    border = vim.g.border,
    title = " " .. heading .. " ",
    title_pos = "center",
  })
  vim.wo[win].wrap = true
  return win
end

M.float = float

--- The full thread in a float.
---@param thread codediff_pr.Thread
---@return number win
function M.thread_float(thread)
  local state = thread.pending and "unsent" or (thread.resolved and "resolved" or "open")
  if thread.outdated then
    state = state .. ", outdated"
  end
  local lines = { "# " .. anchor(thread) .. " · " .. thread.side .. " side · " .. state, "" }
  for index, comment in ipairs(thread.comments) do
    lines[#lines + 1] = "[" .. index .. "] " .. comment.author
    vim.list_extend(lines, vim.split(comment.content or "", "\n"))
    lines[#lines + 1] = ""
  end
  if not thread.pending then
    lines[#lines + 1] = "id: "
      .. table.concat(vim.tbl_map(function(comment) return comment.id end, thread.comments), " ")
  end
  return float(lines, "pull request comment")
end

--- The reviews themselves: a verdict and a body per reviewer, which is where a
--- review that is not about any one line lives.
---@param reviews table[]
---@return number win
function M.reviews_float(reviews)
  local lines = {}
  if #reviews == 0 then
    lines = { "# no reviews on this pull request" }
  end
  for _, review in ipairs(reviews) do
    lines[#lines + 1] = "## " .. review.author .. " · " .. review.state
    if review.content ~= "" then
      vim.list_extend(lines, vim.split(review.content, "\n"))
    end
    lines[#lines + 1] = ""
  end
  return float(lines, "pull request reviews")
end

return M
