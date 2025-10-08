return {
  {
    "mrjones2014/smart-splits.nvim",
    opts = {},
    keys = {
      { "<C-h>", function() require("smart-splits").move_cursor_left() end, desc = "Move to left split" },
      { "<C-j>", function() require("smart-splits").move_cursor_down() end, desc = "Move to down split" },
      { "<C-k>", function() require("smart-splits").move_cursor_up() end, desc = "Move to up split" },
      { "<C-l>", function() require("smart-splits").move_cursor_right() end, desc = "Move to right split" },
      { "<A-h>", function() require("smart-splits").resize_left() end, desc = "Resize left" },
      { "<A-j>", function() require("smart-splits").resize_down() end, desc = "Resize down" },
      { "<A-k>", function() require("smart-splits").resize_up() end, desc = "Resize up" },
      { "<A-l>", function() require("smart-splits").resize_right() end, desc = "Resize right" },
    },
  },
}
