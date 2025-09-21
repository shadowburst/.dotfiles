return {
  {
    "aserowy/tmux.nvim",
    opts = {},
    keys = {
      { "<c-h>", function() require("tmux").move_left() end, desc = "Go to the left window" },
      { "<c-j>", function() require("tmux").move_bottom() end, desc = "Go to the down window" },
      { "<c-k>", function() require("tmux").move_top() end, desc = "Go to the up window" },
      { "<c-l>", function() require("tmux").move_right() end, desc = "Go to the right window" },
      { "<a-h>", function() require("tmux").resize_left() end, desc = "Increase window size left" },
      { "<a-j>", function() require("tmux").resize_bottom() end, desc = "Increase window size down" },
      { "<a-k>", function() require("tmux").resize_top() end, desc = "Increase window size up" },
      { "<a-l>", function() require("tmux").resize_right() end, desc = "Increase window size right" },
    },
  },
}
