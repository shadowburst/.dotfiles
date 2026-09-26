-- Run: nvim -u NONE -l config/neovim/tests/codediff-pr.lua
vim.opt.runtimepath:prepend(vim.fn.stdpath("config"))

local render = require("codediff_pr.render")

local PATH = "src/a.lua"

---@param n number
---@param line number
---@return table
local function comment(n, line)
  return {
    id = "c" .. n,
    database_id = "d" .. n,
    path = PATH,
    start_line = line,
    end_line = line,
    side = "new",
    author = "alice",
    content = "body " .. n,
    created = 1758000000,
    association = "MEMBER",
    resolved = false,
    outdated = false,
    deletable = true,
  }
end

local comments = {
  comment(1, 3),
  -- an old-side thread on its own row
  vim.tbl_extend("force", comment(2, 5), { side = "old" }),
  -- a five comment thread, past the cap
  comment(3, 7),
  comment(4, 7),
  comment(5, 7),
  comment(6, 7),
  comment(7, 7),
  -- a file level comment, and a comment belonging to another file
  vim.tbl_extend("force", comment(8, 3), { start_line = vim.NIL, end_line = vim.NIL }),
  vim.tbl_extend("force", comment(9, 3), { path = "src/b.lua" }),
  -- a resolved thread and one still held back, both on their own rows
  vim.tbl_extend("force", comment(10, 9), { resolved = true }),
  vim.tbl_extend("force", comment(11, 11), { pending = true }),
}

---@param expanded boolean
---@return table
local function build(expanded)
  return render.build(comments, PATH, {
    max_rows = 3,
    is_expanded = function() return expanded end,
  })
end

local function text_of(row)
  return table.concat(vim.tbl_map(function(chunk) return chunk[1] end, row), "")
end

local function pane(lines)
  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(
    buf,
    0,
    -1,
    false,
    vim.tbl_map(function(n) return "line " .. n end, vim.fn.range(1, lines or 12))
  )
  return buf
end

-- 1. threads group by anchor and land in ascending row order
local layout = build(false)
assert(#layout.threads == 6, "one thread per anchor, got " .. #layout.threads)
assert(vim.deep_equal(layout.rows, { 1, 3, 5, 7, 9, 11 }), "rows must be sorted, got " .. vim.inspect(layout.rows))
assert(#layout.new[1] == 3, "a file level comment draws a three row box, got " .. #layout.new[1])
assert(#layout.new[3] == 3, "a single comment thread draws a three row box, got " .. #layout.new[3])
assert(#layout.old[5] == 3, "an old side thread draws on the old side, got " .. #layout.old[5])
assert(layout.new[5] == nil, "an old side thread must not draw on the new side")
assert(#layout.new[7] == 4, "a thread over the cap stays collapsed, got " .. #layout.new[7])
assert(layout.new[13] == nil, "another file's comments are not drawn here")
assert(#layout.new[9] == 3, "a resolved thread still draws a box, got " .. #layout.new[9])

-- 2. thread_at only answers for the side that owns the row
assert(render.thread_at(layout, "new", 3) ~= nil, "the new side owns row 3")
assert(render.thread_at(layout, "old", 3) == nil, "the old side does not own row 3")
assert(render.thread_at(layout, "old", 5) ~= nil, "the old side owns row 5")

-- 3. a thread carries the state its rows are drawn from
assert(render.thread_at(layout, "new", 9).resolved, "row 9 is resolved")
assert(render.thread_at(layout, "new", 11).pending, "row 11 is unsent")
assert(render.thread_at(layout, "new", 3).pending == false, "a published thread is not unsent")

-- 4. collapsed shows the first comment and counts the rest; expanded shows them
-- all, with no overflow row left to count
assert(
  text_of(layout.new[7][3]):find("more", 1, true) ~= nil,
  "the collapsed box counts the rest: " .. text_of(layout.new[7][3])
)
local expanded = build(true)
assert(#expanded.new[3] == 3, "one comment still draws a three row box when expanded")
assert(#expanded.new[7] == 7, "five comments in a box, got " .. #expanded.new[7])
for index = 2, 6 do
  assert(text_of(expanded.new[7][index]):find("more", 1, true) == nil, "an expanded box has no overflow row")
end

-- 5. the box is a rule, the comments, a rule, with nothing padding it away
-- from the code, and every row of it closes on the same column. Lua patterns
-- are byte-based, so the drawing is checked by its corners and its width.
assert(
  text_of(layout.new[3][1]):sub(1, 3) == "╭" and text_of(layout.new[3][1]):sub(-3) == "╮",
  "a rounded rule opens the box: " .. text_of(layout.new[3][1])
)
assert(
  text_of(layout.new[3][3]):sub(1, 3) == "╰" and text_of(layout.new[3][3]):sub(-3) == "╯",
  "a rounded rule closes the box: " .. text_of(layout.new[3][3])
)
local rule = vim.api.nvim_strwidth(text_of(layout.new[3][1]))
assert(rule >= 50, "the box is at least as wide as Snacks draws one, got " .. rule)
for _, index in ipairs({ 1, 2, 3 }) do
  assert(
    vim.api.nvim_strwidth(text_of(layout.new[3][index])) == rule,
    "row " .. index .. " must close on the rule's column"
  )
end
local body = text_of(layout.new[3][2])
assert(body:sub(1, 4) == "│ " and body:sub(-3) == "│", "a comment is boxed: " .. body)
assert(body:find("alice", 1, true) ~= nil, "the row names its author: " .. body)
assert(body:find("body 1", 1, true) ~= nil, "the row carries the comment: " .. body)
assert(
  body:find("3-3", 1, true) == nil,
  "a single line comment needs no label, the box already says where it is: " .. body
)

-- 5b. a file level comment has no line to point at, so it names the file
assert(text_of(layout.new[1][2]):find("file", 1, true) ~= nil, "a file level comment says so")

-- 5c. a range spells out both ends, since one line number would be a lie
local range = render.build({ vim.tbl_extend("force", comment(12, 5), { start_line = 3 }) }, PATH, {
  max_rows = 3,
  is_expanded = function() return false end,
})
assert(text_of(range.new[5][2]):find("3-5", 1, true) ~= nil, "a range names both ends: " .. text_of(range.new[5][2]))

-- 6. both panes get the same number of rows per anchor, so the diff stays aligned
local new_buf, old_buf = pane(), pane()
render.apply({ new = new_buf, old = old_buf }, layout)
local new_rows, old_rows = render.virt_rows(new_buf, render.ns), render.virt_rows(old_buf, render.ns)
assert(vim.deep_equal(new_rows, old_rows), "collapsed panes must match: " .. vim.inspect(new_rows, old_rows))
assert(new_rows[3] == 3 and new_rows[5] == 3 and new_rows[7] == 4, "one box each, got " .. vim.inspect(new_rows))

-- 7. a taller box still pads the other pane
render.apply({ new = new_buf, old = old_buf }, expanded)
new_rows, old_rows = render.virt_rows(new_buf, render.ns), render.virt_rows(old_buf, render.ns)
assert(new_rows[7] == 7 and old_rows[7] == 7, "the old pane pads to the block, got " .. vim.inspect(old_rows))
assert(vim.deep_equal(new_rows, old_rows), "expanded panes must match: " .. vim.inspect(new_rows, old_rows))

-- 8. the padding is blank, so only the owning pane shows text
---@param index? number which row of the block, defaulting to the first
local function text_at(buf, row, index)
  for _, mark in ipairs(vim.api.nvim_buf_get_extmarks(buf, render.ns, 0, -1, { details = true })) do
    if mark[2] + 1 == row then
      return text_of(mark[4].virt_lines[index or 1])
    end
  end
end
assert(text_at(old_buf, 5, 2):match("alice") ~= nil, "the old pane draws its own block")
assert(text_at(new_buf, 5) == "", "the new pane only pads row 5, got " .. vim.inspect(text_at(new_buf, 5)))
assert(text_at(new_buf, 3, 2):match("alice") ~= nil, "the new pane draws its own block")

-- 9. re-applying replaces the blocks instead of stacking them
render.apply({ new = new_buf, old = old_buf }, layout)
assert(
  #vim.api.nvim_buf_get_extmarks(new_buf, render.ns, 0, -1, {}) == #layout.rows,
  "a second apply must clear the first, got "
    .. #vim.api.nvim_buf_get_extmarks(new_buf, render.ns, 0, -1, {})
    .. " marks"
)
assert(
  vim.deep_equal(render.virt_rows(new_buf, render.ns), { [1] = 3, [3] = 3, [5] = 3, [7] = 4, [9] = 3, [11] = 3 }),
  "collapsed again"
)

-- 10. a row past the end of a buffer is skipped rather than erroring
local short = pane(2)
render.apply({ new = short, old = old_buf }, layout)
assert(
  vim.deep_equal(render.virt_rows(short, render.ns), { [1] = 3 }),
  "only row 1 fits, got " .. vim.inspect(render.virt_rows(short, render.ns))
)

-- 11. comments for no file at all build nothing
local empty = render.build(comments, "src/other.lua", {
  max_rows = 3,
  is_expanded = function() return false end,
})
assert(#empty.rows == 0, "an unrelated file has no rows")

-- 12. Snacks' badge hands back chunks wider than virt_lines accepts, so the
-- real one is stubbed in: its rounded ends are three element chunks.
_G.Snacks = { picker = { highlight = { badge = function(text, hl)
  return { { "", hl .. "Inv", inline = true }, { text, hl }, { "", hl .. "Inv", inline = true }, { " " } }
end } } }
render.define_highlights()
local snacks_layout = render.build(comments, PATH, { max_rows = 3, is_expanded = function() return false end })
local snacks_pane = pane()
render.apply({ new = snacks_pane, old = nil }, snacks_layout)
assert(
  vim.deep_equal(render.virt_rows(snacks_pane, render.ns), { [1] = 3, [3] = 3, [5] = 3, [7] = 4, [9] = 3, [11] = 3 }),
  "a Snacks badge must still draw"
)

print("codediff-pr: all assertions passed")
