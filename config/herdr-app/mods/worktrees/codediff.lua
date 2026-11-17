-- CodeDiff's diff of two blobs, as JSON on stdout: { left, right, changes }.
-- `changes` is codediff.nvim's own result (VS Code's algorithm): line ranges and
-- character ranges, 1-based, end exclusive, columns in UTF-16 units.
-- Run: nvim -u NONE -i NONE -l codediff.lua <left blob> <right blob>, in the
-- repository. An empty blob id is a missing side (an added or a deleted file).

local MAX = 2 * 1024 * 1024

local function fail(message)
  io.stderr:write(message, "\n")
  os.exit(1)
end

local function blob(sha)
  if not sha or sha == "" then return {} end
  local r = vim.system({ "git", "cat-file", "blob", sha }, { text = true }):wait()
  if r.code ~= 0 then fail(vim.trim(r.stderr or "git cat-file failed")) end
  if #r.stdout > MAX then fail("The file is too large to compare.") end
  local lines = vim.split(r.stdout, "\n", { plain = true })
  if lines[#lines] == "" then table.remove(lines) end
  return lines
end

if not pcall(vim.cmd.packadd, "codediff.nvim") then fail("codediff.nvim is not installed.") end
local ok, diff = pcall(require, "codediff.core.diff")
if not ok then fail(tostring(diff)) end

local left, right = blob(arg[1]), blob(arg[2])
local result = diff.compute_diff(left, right, {})
io.stdout:write(vim.json.encode({ left = left, right = right, changes = result.changes }))
