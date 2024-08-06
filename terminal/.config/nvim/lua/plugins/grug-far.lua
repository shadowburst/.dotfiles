return {
	{
		"MagicDuck/grug-far.nvim",
		cmd = { "GrugFar" },
		opts = {
			startCursorRow = 4,
			headerMaxWidth = 80,
			transient = true,
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
				desc = "Replace <cword> in file",
			},
			{
				"<leader>sr",
				function()
					require("grug-far").grug_far({
						prefills = {
							flags = "--hidden " .. vim.fn.expand("%"),
						},
					})
				end,
				mode = { "v" },
				desc = "Replace selection in file",
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
				desc = "Replace <cword> in files",
			},
			{
				"<leader>sR",
				function()
					require("grug-far").grug_far({
						prefills = {
							flags = "--hidden",
						},
					})
				end,
				mode = { "v" },
				desc = "Replace selection in files",
			},
		},
	},
}
