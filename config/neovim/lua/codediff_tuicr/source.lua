---@brief tuicr CLI access. Every call is async and lands back on the main loop.
local M = {}

local DEFAULT_TYPES = { "note", "suggestion", "issue", "praise" }

--- Run a tuicr subcommand and decode the JSON it prints.
---@param args string[]
---@param cb fun(data: any, err: string?)
function M.run(args, cb)
  if vim.fn.executable("tuicr") ~= 1 then
    return vim.schedule(function() cb(nil, "tuicr is not on $PATH") end)
  end
  vim.system(vim.list_extend({ "tuicr" }, args), { text = true }, function(result)
    vim.schedule(function()
      if result.code ~= 0 then
        local err = vim.trim(result.stderr or "")
        return cb(nil, err ~= "" and err or ("tuicr exited with " .. result.code))
      end
      local ok, data = pcall(vim.json.decode, result.stdout or "", { luanil = { object = true, array = true } })
      if not ok then
        return cb(nil, "could not decode tuicr output")
      end
      cb(data, nil)
    end)
  end)
end

---@param data any
---@return any[]
local function rows(data) return type(data) == "table" and data or {} end

--- Name the repo a slug belongs to. Without it tuicr resolves a local slug
--- against the cwd, which is the wrong checkout whenever a diff of another
--- repository is on screen, and `review add` exits 0 on the wrong session.
---@param args string[]
---@param repo string?
---@return string[]
local function selector(args, repo) return repo and vim.list_extend(args, { "--repo", repo }) or args end

--- Sessions for a checkout: its local sessions plus the PR sessions of its origin repo.
---@param repo string
---@param cb fun(sessions: table[], err: string?)
function M.list_sessions(repo, cb)
  M.run(selector({ "review", "list" }, repo), function(data, err)
    if err then
      return cb({}, err)
    end
    cb(rows(data), nil)
  end)
end

--- Every comment in a session, whatever its target.
---@param slug string
---@param repo string? repo the slug belongs to; tuicr defaults it to the cwd
---@param cb fun(comments: table[], err: string?)
function M.comments(slug, repo, cb)
  M.run(selector({ "review", "comments", "--session", slug }, repo), function(data, err)
    if err then
      return cb({}, err)
    end
    cb(rows(data), nil)
  end)
end

--- The number of the checkout branch's open PR, or nil when there is none.
--- GitHub only, and only ever a hint: a branch without a PR falls through to a
--- commit range.
---@param root string
---@param cb fun(number: string?)
function M.open_pr(root, cb)
  if vim.fn.executable("gh") ~= 1 then
    return cb(nil)
  end
  vim.system({ "gh", "pr", "view", "--json", "number" }, { cwd = root, text = true }, function(result)
    vim.schedule(function()
      local ok, data = pcall(vim.json.decode, result.stdout or "", { luanil = { object = true, array = true } })
      local number = result.code == 0 and ok and type(data) == "table" and data.number or nil
      cb(number and tostring(number) or nil)
    end)
  end)
end

---@class codediff_tuicr.AddSpec
---@field slug string
---@field repo? string
---@field content string
---@field path? string
---@field line? number
---@field end_line? number
---@field side? string
---@field type? string
---@field username? string

---@param spec codediff_tuicr.AddSpec
---@param cb fun(ok: boolean, err: string?)
function M.add(spec, cb)
  local args = selector({ "review", "add", "--session", spec.slug }, spec.repo)
  if spec.path then
    vim.list_extend(args, { "--target-file", spec.path })
  end
  if spec.line then
    vim.list_extend(args, { "--line", tostring(spec.line), "--side", spec.side or "new" })
  end
  if spec.end_line then
    vim.list_extend(args, { "--end-line", tostring(spec.end_line) })
  end
  if spec.type then
    vim.list_extend(args, { "--type", spec.type })
  end
  if spec.username then
    vim.list_extend(args, { "--username", spec.username })
  end
  args[#args + 1] = spec.content
  M.run(args, function(_, err) cb(err == nil, err) end)
end

---@param slug string
---@param id string
---@param repo string?
---@param cb fun(ok: boolean, err: string?)
function M.delete(slug, id, repo, cb)
  M.run(
    selector({ "review", "delete", "--session", slug, "--comment-id", tostring(id) }, repo),
    function(_, err) cb(err == nil, err) end
  )
end

--- Comment type ids, in the order `gr` cycles them.
--- ponytail: line scan of tuicr's config.toml; tuicr has no config query, and an
--- unknown type id makes `review add` fail.
---@return string[]
function M.comment_types()
  local found = vim.fs.find("config.toml", {
    path = vim.fn.stdpath("config") .. "/tuicr",
    type = "file",
    limit = 1,
  })[1]
  if not found then
    return DEFAULT_TYPES
  end
  local types, in_types = {}, false
  for _, line in ipairs(vim.fn.readfile(found)) do
    local header = line:match("^%s*%[%[?([%w_]+)")
    if header then
      in_types = header == "comment_types"
    end
    local id = line:match('^%s*id%s*=%s*"([^"]+)"')
    if in_types and id then
      types[#types + 1] = id
    end
  end
  return #types > 0 and types or DEFAULT_TYPES
end

return M
