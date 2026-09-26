-- Run: nvim -u NONE -l config/neovim/tests/codediff-tuicr.lua
vim.opt.runtimepath:prepend(vim.fn.stdpath("config"))

local render = require("codediff_tuicr.render")

local PATH = "src/a.lua"

---@param n number
---@param line number
---@return table
local function comment(n, line)
  return {
    id = "c" .. n,
    path = PATH,
    start_line = line,
    end_line = line,
    side = "new",
    comment_type = "note",
    author = "alice",
    lifecycle_state = "local_draft",
    content = "body " .. n,
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
}

---@param expanded boolean
---@return table
local function build(expanded)
  return render.build(comments, PATH, {
    max_rows = 3,
    is_expanded = function() return expanded end,
  })
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
assert(#layout.threads == 4, "one thread per anchor, got " .. #layout.threads)
assert(vim.deep_equal(layout.rows, { 1, 3, 5, 7 }), "rows must be sorted, got " .. vim.inspect(layout.rows))
assert(#layout.new[1] == 1, "a file level comment draws one row at row 1")
assert(#layout.new[3] == 1, "a single comment thread draws one row")
assert(#layout.old[5] == 1, "an old side thread draws on the old side")
assert(layout.new[5] == nil, "an old side thread must not draw on the new side")
assert(#layout.new[7] == 1, "a thread over the cap stays collapsed")
assert(layout.new[9] == nil, "another file's comments are not drawn here")

-- 2. thread_at only answers for the side that owns the row
assert(render.thread_at(layout, "new", 3) ~= nil, "the new side owns row 3")
assert(render.thread_at(layout, "old", 3) == nil, "the old side does not own row 3")
assert(render.thread_at(layout, "old", 5) ~= nil, "the old side owns row 5")

-- 3. collapsed and expanded differ only above the cap
local expanded = build(true)
assert(#expanded.new[3] == 1, "one comment still draws one row when expanded")
assert(#expanded.new[7] == 4, "three rows plus the overflow row, got " .. #expanded.new[7])
assert(expanded.new[7][4][1][1]:match("more") ~= nil, "the overflow row says so")

-- 4. both panes get the same number of rows per anchor, so the diff stays aligned
local new_buf, old_buf = pane(), pane()
render.apply({ new = new_buf, old = old_buf }, layout)
local new_rows, old_rows = render.virt_rows(new_buf, render.ns), render.virt_rows(old_buf, render.ns)
assert(vim.deep_equal(new_rows, old_rows), "collapsed panes must match: " .. vim.inspect(new_rows, old_rows))
assert(new_rows[3] == 1 and new_rows[5] == 1 and new_rows[7] == 1, "one row each, got " .. vim.inspect(new_rows))

-- 5. a taller block still pads the other pane
render.apply({ new = new_buf, old = old_buf }, expanded)
new_rows, old_rows = render.virt_rows(new_buf, render.ns), render.virt_rows(old_buf, render.ns)
assert(new_rows[7] == 4 and old_rows[7] == 4, "the old pane pads to the block, got " .. vim.inspect(old_rows))
assert(vim.deep_equal(new_rows, old_rows), "expanded panes must match: " .. vim.inspect(new_rows, old_rows))

-- 6. the padding is blank, so only the owning pane shows text
local function text_at(buf, row)
  for _, mark in ipairs(vim.api.nvim_buf_get_extmarks(buf, render.ns, 0, -1, { details = true })) do
    if mark[2] + 1 == row then
      return table.concat(vim.tbl_map(function(chunk) return chunk[1] end, mark[4].virt_lines[1]), "")
    end
  end
end
assert(text_at(old_buf, 5):match("alice") ~= nil, "the old pane draws its own block")
assert(text_at(new_buf, 5) == "", "the new pane only pads row 5, got " .. vim.inspect(text_at(new_buf, 5)))
assert(text_at(new_buf, 3):match("alice") ~= nil, "the new pane draws its own block")

-- 7. re-applying replaces the blocks instead of stacking them
render.apply({ new = new_buf, old = old_buf }, layout)
assert(
  #vim.api.nvim_buf_get_extmarks(new_buf, render.ns, 0, -1, {}) == #layout.rows,
  "a second apply must clear the first, got "
    .. #vim.api.nvim_buf_get_extmarks(new_buf, render.ns, 0, -1, {})
    .. " marks"
)
assert(vim.deep_equal(render.virt_rows(new_buf, render.ns), { [1] = 1, [3] = 1, [5] = 1, [7] = 1 }), "collapsed again")

-- 8. a row past the end of a buffer is skipped rather than erroring
local short = pane(2)
render.apply({ new = short, old = old_buf }, layout)
assert(
  vim.deep_equal(render.virt_rows(short, render.ns), { [1] = 1 }),
  "only row 1 fits, got " .. vim.inspect(render.virt_rows(short, render.ns))
)

-- 9. comments for no file at all build nothing
local empty = render.build(comments, "src/other.lua", {
  max_rows = 3,
  is_expanded = function() return false end,
})
assert(#empty.rows == 0, "an unrelated file has no rows")

print("codediff-tuicr: all assertions passed")
