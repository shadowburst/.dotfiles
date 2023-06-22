return {
	{
		"folke/flash.nvim",
		keys = {
			{
				"s",
				mode = { "n", "o", "x" },
				function()
					require("flash").jump()
				end,
			},
			{
				"S",
				mode = { "n", "o", "x" },
				function()
					require("flash").jump({
						pattern = vim.fn.expand("<cword>"),
					})
				end,
			},
		},
		opts = {
			jump = {
				autojump = true,
			},
		},
	},
}
