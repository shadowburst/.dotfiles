local config = require("config")

return {
  {
    "cbochs/grapple.nvim",
    dependencies = { "nvim-mini/mini.icons" },
    cmd = { "Grapple" },
    ---@module 'grapple'
    ---@type grapple.options
    opts = {
      scope = "git_branch",
      win_opts = { border = config.border },
    },
    keys = {
      { "<s-h>", "<cmd>Grapple cycle_tags prev<cr>", desc = "Grapple cycle previous tag" },
      { "<s-l>", "<cmd>Grapple cycle_tags next<cr>", desc = "Grapple cycle next tag" },
      {
        "m",
        function()
          local char = vim.fn.getcharstr()
          -- Handle ESC, Ctrl-C, etc.
          if char == "" or vim.startswith(char, "<") then
            return
          end
          local grapple = require("grapple")
          grapple.tag({ name = char })
          local filepath = vim.api.nvim_buf_get_name(0)
          local filename = vim.fn.fnamemodify(filepath, ":t")
          vim.notify("Marked " .. filename .. " as " .. char)
        end,
        desc = "Grapple save mark",
        noremap = true,
        silent = true,
      },
      {
        "'",
        function()
          local char = vim.fn.getcharstr()
          -- Handle ESC, Ctrl-C, etc.
          if char == "" or vim.startswith(char, "<") then
            return
          end
          local grapple = require("grapple")
          if char == "'" then
            grapple.toggle_tags()
            return
          end
          grapple.select({ name = char })
        end,
        desc = "Grapple open mark",
        noremap = true,
        silent = true,
      },
    },
  },
}
