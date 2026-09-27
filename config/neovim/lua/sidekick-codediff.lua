-- sidekick cannot name CodeDiff's revision buffers. They are fugitive-style
-- `codediff://` virtuals with buftype=nowrite, so `Loc.is_file` rejects them and
-- every `{file}` / `{position}` send dies on "Nothing to send.". The buffer name
-- still carries the real path and the revision, so hand sidekick those instead.
--
-- A working-tree side is a real file (`helpers.is_virtual_revision` calls it
-- "WORKING"), which sidekick already handles.

local Config = require("sidekick.config")
local Loc = require("sidekick.cli.context.location")
local VirtualFile = require("codediff.core.virtual_file")

local M = {}

M.SCHEME = "codediff://"

--- The path and revision a CodeDiff revision buffer shows.
---@param buf integer
---@return {path: string, revision: string}|nil
function M.parse(buf)
  local name = vim.api.nvim_buf_get_name(buf)
  if name:sub(1, #M.SCHEME) ~= M.SCHEME then
    return nil
  end
  local root, revision, path = VirtualFile.parse_url(name)
  if not (root and revision and path) then
    return nil
  end
  return { path = root .. "/" .. path, revision = revision }
end

--- sidekick's own location for a real file, or the same rendered against the
--- revision. `ctx.range` has to survive the name override, or a visual
--- `<leader>at` silently collapses to a single position.
---@param ctx sidekick.context.ctx
---@param kind "file"|"position"
---@return sidekick.Text[]
local function location(ctx, kind)
  local rev = M.parse(ctx.buf)
  if not rev then
    return Loc.get(ctx, { kind = kind })
  end
  -- `abc123^` means the parent of abc123, and the caret only reads as noise
  local label = rev.revision ~= "HEAD" and (" " .. (rev.revision:gsub("%^$", ""))) or ""
  return Loc.get(vim.tbl_extend("force", ctx, { name = rev.path .. label }), { kind = kind })
end

--- Teach sidekick's `{file}` and `{position}` about revision buffers. Replaced
--- rather than wrapped: the registry resolves `Config.cli.context` before its
--- own table, and a real file still has to render as one.
function M.setup()
  Config.cli.context.file = function(ctx) return location(ctx, "file") end
  Config.cli.context.position = function(ctx) return location(ctx, "position") end
end

return M
