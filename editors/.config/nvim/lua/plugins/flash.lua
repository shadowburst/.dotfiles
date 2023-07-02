return {
	{
		"folke/flash.nvim",
		keys = {
			{
				"s",
				mode = { "n", "o", "x" },
				false,
			},
			{
				"r",
				mode = "o",
				function()
					require("flash").remote()
				end,
				desc = "Remote Flash",
			},
			{
				"R",
				mode = { "o", "x" },
				function()
					require("flash").treesitter_search()
				end,
				desc = "Treesitter Search",
			},
		},
		opts = {
			modes = {
				search = {
					highlight = {
						backdrop = true,
					},
					search = {
						wrap = false,
						multi_window = false,
					},
				},
			},
		},
	},
}
