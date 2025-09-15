---@param focus boolean
---@return boolean: true if the pane was opened successfully, false otherwise
local function open_opencode(focus)
  local success = require("tmux.wrapper.tmux").execute("split-window -h -l 80 opencode")
  if not success then
    vim.notify("Failed to open tmux pane", vim.log.levels.ERROR, { title = "opencode" })
    return false
  end
  if focus then
    require("tmux").move_right()
  end
  return true
end

return {
  {
    "NickvanDyke/opencode.nvim",
    dependencies = {
      "folke/snacks.nvim",
      "aserowy/tmux.nvim",
    },
    ---@type opencode.Opts
    opts = {
      auto_reload = true,
      on_opencode_not_found = function() return open_opencode(false) end,
    },
    config = function(_, opts) vim.g.opencode_opts = opts end,
    keys = {
      {
        "<leader>oa",
        function() require("opencode").ask("@cursor: ") end,
        desc = "Ask opencode about this",
        mode = "n",
      },
      {
        "<leader>oa",
        function() require("opencode").ask("@selection: ") end,
        desc = "Ask opencode about selection",
        mode = "v",
      },
      {
        "<leader>oc",
        function() require("opencode").prompt("Add documentation comments for @selection") end,
        desc = "Document selection",
        mode = "v",
      },
      {
        "<leader>od",
        function() require("opencode").prompt("Fix this @diagnostic") end,
        desc = "Fix line diagnostic",
      },
      {
        "<leader>oD",
        function() require("opencode").prompt("Fix these @diagnostics") end,
        desc = "Fix buffer diagnostics",
      },
      {
        "<leader>oo",
        function() open_opencode(true) end,
        desc = "Ask opencode",
      },
      {
        "<leader>or",
        function() require("opencode").prompt("Review @buffer for correctness and readability") end,
        desc = "Review file",
      },
    },
  },
}
