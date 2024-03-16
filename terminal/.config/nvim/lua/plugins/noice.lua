return {
	{
		"folke/noice.nvim",
		opts = {
			lsp = {
				hover = {
					view = "hover",
				},
			},
			views = {
				hover = {
					border = {
						style = "rounded",
						padding = { 0, 1 },
					},
					position = {
						row = 2,
					},
				},
			},
		},
		keys = {
			{
				"<leader>nl",
				function()
					require("noice").cmd("last")
				end,
				desc = "Noice Last Message",
			},
			{
				"<leader>nh",
				function()
					require("noice").cmd("history")
				end,
				desc = "Noice History",
			},
			{
				"<leader>na",
				function()
					require("noice").cmd("all")
				end,
				desc = "Noice All",
			},
			{
				"<leader>nd",
				function()
					require("noice").cmd("dismiss")
				end,
				desc = "Dismiss All",
			},
			{ "<leader>snl", false },
			{ "<leader>snh", false },
			{ "<leader>sna", false },
			{ "<leader>snd", false },
		},
	},
}
