return {
	{
		"shadowburst/wurm.nvim",
		event = "VeryLazy",
		opts = {},
		keys = {
			{
				"<S-h>",
				"<cmd>WurmPrev<cr>",
				desc = "Navigate to previous buffer",
			},
			{
				"<S-l>",
				"<cmd>WurmNext<cr>",
				desc = "Navigate to next buffer",
			},
		},
	},
}
