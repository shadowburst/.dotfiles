return {
	{
		"folke/snacks.nvim",
		keys = {
			{
				"<leader>gb",
				function()
					Snacks.git.blame_line({
						win = {
							backdrop = false,
						},
					})
				end,
				desc = "Blame line",
			},
		},
	},
}
