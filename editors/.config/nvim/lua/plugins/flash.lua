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
			{
				"/",
				mode = { "n", "x" },
				function()
					require("flash").jump({
						search = {
							forward = true,
							wrap = false,
							incremental = true,
						},
						jump = {
							history = true,
							register = true,
							nohlsearch = true,
						},
					})
				end,
			},
			{
				"/",
				mode = "o",
				function()
					require("flash").jump({
						search = {
							forward = true,
							wrap = false,
						},
						jump = {
							history = true,
							register = true,
							nohlsearch = true,
						},
					})
				end,
			},
			{
				"?",
				mode = { "n", "x" },
				function()
					require("flash").jump({
						search = {
							forward = false,
							wrap = false,
							incremental = true,
						},
						jump = {
							history = true,
							register = true,
							nohlsearch = true,
						},
					})
				end,
			},
			{
				"?",
				mode = "o",
				function()
					require("flash").jump({
						search = {
							forward = false,
							wrap = false,
						},
						jump = {
							history = true,
							register = true,
							nohlsearch = true,
						},
					})
				end,
			},
			{
				"*",
				mode = "n",
				function()
					require("flash").jump({
						pattern = vim.fn.expand("<cword>"),
						search = {
							forward = true,
							wrap = false,
						},
						jump = {
							history = true,
							register = true,
							nohlsearch = true,
						},
					})
				end,
			},
			{
				"#",
				mode = "n",
				function()
					require("flash").jump({
						pattern = vim.fn.expand("<cword>"),
						search = {
							forward = false,
							wrap = false,
						},
						jump = {
							history = true,
							register = true,
							nohlsearch = true,
						},
					})
				end,
			},
		},
		opts = {},
	},
}
