local ui = require("util.ui")

return {
  {
    "cbochs/grapple.nvim",
    dependencies = { "nvim-mini/mini.icons" },
    cmd = { "Grapple" },
    ---@module 'grapple'
    ---@type grapple.options
    opts = {
      scope = "git_branch",
      win_opts = { border = ui.border },
    },
    keys = {
      { "<leader>;", "<cmd>Grapple toggle<cr>", desc = "Grapple toggle tag" },
      { "<leader>m", "<cmd>Grapple toggle_tags<cr>", desc = "Grapple tags window" },
      { "<s-h>", "<cmd>Grapple cycle_tags prev<cr>", desc = "Grapple cycle previous tag" },
      { "<s-l>", "<cmd>Grapple cycle_tags next<cr>", desc = "Grapple cycle next tag" },
    },
  },
}
