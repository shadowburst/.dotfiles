return {
	{
		"folke/flash.nvim",
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = {
			modes = {
				search = {
					enabled = true,
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
				"s",
				mode = "o",
				function()
					require("flash").treesitter()
				end,
				desc = "Treesitter",
			},
			{
				"r",
				mode = "o",
				function()
					require("flash").remote()
				end,
				desc = "Remote",
			},
		},
	},
}
