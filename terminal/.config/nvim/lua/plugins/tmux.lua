return {
	{
		"aserowy/tmux.nvim",
		keys = {
			{
				"<C-h>",
				function()
					require("tmux").move_left()
				end,
				desc = "Go to the left window",
			},
			{
				"<C-j>",
				function()
					require("tmux").move_bottom()
				end,
				desc = "Go to the down window",
			},
			{
				"<C-k>",
				function()
					require("tmux").move_top()
				end,
				desc = "Go to the up window",
			},
			{
				"<C-l>",
				function()
					require("tmux").move_right()
				end,
				desc = "Go to the right window",
			},
			{
				"<A-h>",
				function()
					require("tmux").resize_left()
				end,
				desc = "Increase window size left",
			},
			{
				"<A-j>",
				function()
					require("tmux").resize_bottom()
				end,
				desc = "Increase window size down",
			},
			{
				"<A-k>",
				function()
					require("tmux").resize_top()
				end,
				desc = "Increase window size up",
			},
			{
				"<A-l>",
				function()
					require("tmux").resize_right()
				end,
				desc = "Increase window size right",
			},
		},
		opts = {},
	},
}
