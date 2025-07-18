return {
  {
    "NickvanDyke/opencode.nvim",
    dependencies = {
      "folke/snacks.nvim",
    },
    ---@type opencode.Config
    opts = {
      auto_reload = true,
      auto_focus = true,
    },
  -- stylua: ignore
  keys = {
    {
      '<leader>oa',
      function() require('opencode').ask() end,
      desc = 'Ask opencode',
      mode = { 'n', 'v' },
    },
    {
      '<leader>oc',
      function() require('opencode').prompt('Add documentation comments for @selection') end,
      desc = 'Document selection',
      mode = 'v',
    },
    {
      '<leader>od',
      function() require('opencode').prompt('Fix these @diagnostics') end,
      desc = 'Fix errors',
    },
    {
      '<leader>oe',
      function() require('opencode').prompt('Explain @cursor and its context') end,
      desc = 'Explain code near cursor'
    },
    {
      '<leader>of',
      function() require('opencode').ask('@file ') end,
      desc = 'Ask opencode about current file',
      mode = { 'n', 'v' },
    },
    {
      '<leader>on',
      function() require('opencode').command('/new') end,
      desc = 'New session',
    },
    {
      '<leader>oo',
      function() require('opencode').toggle() end,
      desc = 'Open opencode',
    },
    {
      '<leader>oo',
      function() require('opencode').prompt('Optimize @selection for performance and readability') end,
      desc = 'Optimize selection',
      mode = 'v',
    },
    {
      '<leader>or',
      function() require('opencode').prompt('Review @file for correctness and readability') end,
      desc = 'Review file',
    },
    {
      '<leader>ot',
      function() require('opencode').prompt('Add tests for @selection') end,
      desc = 'Test selection',
      mode = 'v',
    },
  },
  },
}
