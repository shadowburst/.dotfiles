---@brief GitHub pull request review data, through the `gh` CLI. Every call is
--- async and lands back on the main loop.
---
--- `gh api graphql` takes its variables on stdin (`--input -`): a list-valued
--- variable such as the review mutation's `threads` cannot be passed with `-F`,
--- which typecasts every value to a scalar.
local M = {}

---@class codediff_pr.Pull
---@field number number
---@field id string GraphQL node id, what the review mutation needs
---@field owner string
---@field name string

--- Run `gh` and decode the JSON it prints.
---@param args string[]
---@param cb fun(data: any, err: string?)
---@param opts? { cwd: string?, stdin: string? }
function M.run(args, cb, opts)
  opts = opts or {}
  if vim.fn.executable("gh") ~= 1 then
    return vim.schedule(function() cb(nil, "gh is not on $PATH") end)
  end
  vim.system(vim.list_extend({ "gh" }, args), { cwd = opts.cwd, stdin = opts.stdin, text = true }, function(result)
    vim.schedule(function()
      if result.code ~= 0 then
        local err = vim.trim(result.stderr or "")
        return cb(nil, err ~= "" and err or ("gh exited with " .. result.code))
      end
      local ok, data = pcall(vim.json.decode, result.stdout or "", { luanil = { object = true, array = true } })
      if not ok then
        return cb(nil, "could not decode gh output")
      end
      cb(data, nil)
    end)
  end)
end

---@param data any
---@return any[]
local function rows(data) return type(data) == "table" and data or {} end

---@param query string
---@param variables table
---@param cb fun(data: any, err: string?)
local function graphql(query, variables, cb)
  local stdin = vim.json.encode({ query = query, variables = variables })
  M.run({ "api", "graphql", "--input", "-" }, function(data, err)
    if err then
      return cb(nil, err)
    end
    if type(data) == "table" and data.errors and data.errors[1] then
      return cb(nil, data.errors[1].message or "the GitHub API returned an error")
    end
    cb(type(data) == "table" and data.data or nil, nil)
  end, { stdin = stdin })
end

--- Every open pull request in the checkout, with the node id the review
--- mutation needs.
---@param cb fun(pulls: codediff_pr.Pull[], err: string?)
function M.list_pulls(cb)
  local fields = "number,id,title,author,isDraft,updatedAt,reviewDecision,headRefName"
  M.run({ "pr", "list", "--state", "open", "--limit", "100", "--json", fields }, function(data, err)
    if err then
      return cb({}, err)
    end
    local owner, name = M.repo_parts()
    local pulls = {}
    for _, pr in ipairs(rows(data)) do
      pulls[#pulls + 1] = {
        number = pr.number,
        id = pr.id,
        owner = owner,
        name = name,
        title = pr.title or "",
        author = pr.author and pr.author.login or "?",
        draft = pr.isDraft or false,
        review = pr.reviewDecision or "",
        updated = pr.updatedAt or "",
      }
    end
    cb(pulls, nil)
  end)
end

--- `gh repo view` is a round trip of its own, and every pull request in a
--- checkout belongs to the same repository, so it is asked once.
---@return string owner, string name
function M.repo_parts()
  if M.repo then
    return M.repo:match("^(.-)/(.+)$")
  end
  return "", ""
end

---@param cb fun(err: string?)
function M.load_repo(cb)
  M.run({ "repo", "view", "--json", "nameWithOwner" }, function(data, err)
    if err then
      return cb(err)
    end
    local repo = type(data) == "table" and data.nameWithOwner or nil
    M.repo = repo
    -- `repo and nil or "..."` always takes the `or` branch: `repo and nil` is
    -- nil whatever `repo` is.
    if not repo then
      return cb("could not name this repository")
    end
    cb(nil)
  end)
end

---@param pull codediff_pr.Pull
---@return string
local function repo_path(pull) return string.format("repos/%s/%s", pull.owner, pull.name) end

--- GitHub timestamps are ISO 8601; a relative time wants seconds. `strptime`
--- returns seconds on Neovim 0.11 and a field table before that.
---@param iso string?
---@return number?
local function epoch(iso)
  if type(iso) ~= "string" then
    return nil
  end
  local parsed = vim.fn.strptime("%Y-%m-%dT%H:%M:%SZ", iso)
  if type(parsed) == "table" then
    parsed = os.time(parsed)
  end
  return type(parsed) == "number" and parsed > 0 and parsed or nil
end

local THREADS_QUERY = [[
query($owner:String!,$name:String!,$number:Int!,$cursor:String = null){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviewThreads(first:100, after:$cursor){
        pageInfo{ hasNextPage endCursor }
        nodes{
          isResolved isOutdated diffSide path subjectType
          line startLine originalLine originalStartLine
          comments(first:100){
            nodes{ id fullDatabaseId author{login} authorAssociation body createdAt viewerCanDelete }
          }
        }
      }
    }
  }
}]]

--- One review thread as comments, all anchored on the thread's line the way
--- GitHub draws them. An outdated thread has lost its `line` to the diff, so
--- its original position is the next best anchor; a file-level thread has no
--- line at all and lands at the top of the file.
---@param node table
---@return table[]
local function thread_comments(node)
  local line = node.line or node.originalLine
  local first = node.startLine or node.originalStartLine
  local out = {}
  for _, comment in ipairs(node.comments.nodes) do
    out[#out + 1] = {
      id = comment.id,
      database_id = comment.fullDatabaseId,
      path = node.path,
      -- `start_line` is always set, because the render layer reads a comment
      -- with no starting line as a file-level one.
      start_line = first or line,
      end_line = line,
      side = node.diffSide == "LEFT" and "old" or "new",
      author = (comment.author and comment.author.login) or "?",
      content = comment.body or "",
      created = epoch(comment.createdAt),
      association = comment.authorAssociation or "",
      resolved = node.isResolved or false,
      outdated = node.isOutdated or false,
      deletable = comment.viewerCanDelete or false,
    }
  end
  return out
end

--- Every comment in a pull request's review threads, replies included.
---@param pull codediff_pr.Pull
---@param cb fun(comments: table[], err: string?)
function M.threads(pull, cb)
  local collected, cursor = {}, nil
  local function page()
    graphql(
      THREADS_QUERY,
      { owner = pull.owner, name = pull.name, number = pull.number, cursor = cursor },
      function(data, err)
        if err then
          return cb({}, err)
        end
        local threads = data.repository.pullRequest.reviewThreads
        for _, node in ipairs(threads.nodes) do
          vim.list_extend(collected, thread_comments(node))
        end
        if threads.pageInfo.hasNextPage then
          cursor = threads.pageInfo.endCursor
          return page()
        end
        cb(collected, nil)
      end
    )
  end
  page()
end

--- The reviews left on a pull request: a verdict and a body per reviewer.
---@param pull codediff_pr.Pull
---@param cb fun(reviews: table[], err: string?)
function M.reviews(pull, cb)
  M.run({ "api", repo_path(pull) .. "/pulls/" .. pull.number .. "/reviews" }, function(data, err)
    if err then
      return cb({}, err)
    end
    cb(
      vim.tbl_map(
        function(review)
          return {
            author = (review.user and review.user.login) or "?",
            state = review.state or "",
            content = vim.trim(review.body or ""),
            submitted_at = review.submitted_at or "",
          }
        end,
        rows(data)
      ),
      nil
    )
  end)
end

local SUBMIT_MUTATION = [[
mutation($pull:ID!,$body:String,$event:PullRequestReviewEvent!,$threads:[DraftPullRequestReviewThread!]!){
  addPullRequestReview(input:{pullRequestId:$pull, body:$body, event:$event, threads:$threads}){
    pullRequestReview{ id }
  }
}]]

--- Publish a review. The head commit is left out on purpose: GitHub attaches
--- the review to whatever the pull request's head is when it lands, so a
--- fetch-time sha cannot go stale here. A rejected line still fails the
--- mutation, which is how a pull request that moved under the diff announces
--- itself.
---@param pull codediff_pr.Pull
---@param body string
---@param event "COMMENT"|"APPROVE"|"REQUEST_CHANGES"
---@param threads table[] `{ path, line, side, body }`, plus `startLine` for a range
---@param cb fun(ok: boolean, err: string?)
function M.submit(pull, body, event, threads, cb)
  graphql(
    SUBMIT_MUTATION,
    { pull = pull.id, body = body, event = event, threads = threads },
    function(_, err) cb(err == nil, err) end
  )
end

--- Delete a review comment of your own. GitHub refuses anyone else's, which is
--- what `viewerCanDelete` on the thread's comments already reports.
---@param pull codediff_pr.Pull
---@param database_id string
---@param cb fun(ok: boolean, err: string?)
function M.delete(pull, database_id, cb)
  M.run(
    { "api", "--method", "DELETE", repo_path(pull) .. "/pulls/comments/" .. database_id },
    function(_, err) cb(err == nil, err) end
  )
end

return M
