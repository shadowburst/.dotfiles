return {
	{
		"folke/flash.nvim",
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
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
		keys = {
			{
				"r",
				mode = "o",
				function()
					require("flash").remote()
				end,
				desc = "Remote",
			},
			{
				"R",
				mode = { "o", "x" },
				function()
					require("flash").treesitter_search()
				end,
				desc = "Treesitter search",
			},
		},
	},
}
