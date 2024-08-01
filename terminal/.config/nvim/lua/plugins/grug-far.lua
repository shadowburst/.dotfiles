return {
	{
		"MagicDuck/grug-far.nvim",
		cmd = { "GrugFar" },
		opts = {
			startCursorRow = 4,
			headerMaxWidth = 80,
		},
		keys = {
			{
				"<leader>sr",
				function()
					require("grug-far").grug_far({
						prefills = {
							search = vim.fn.expand("<cword>"),
							flags = "--hidden " .. vim.fn.expand("%"),
						},
					})
				end,
				mode = { "n", "v" },
				desc = "Replace in current file",
			},
			{
				"<leader>sR",
				function()
					require("grug-far").grug_far({
						prefills = {
							search = vim.fn.expand("<cword>"),
							flags = "--hidden",
						},
					})
				end,
				mode = { "n", "v" },
				desc = "Replace in files",
			},
		},
	},
}
