return {
	{
		"MagicDuck/grug-far.nvim",
		cmd = { "GrugFar" },
		opts = {
			startCursorRow = 3,
			headerMaxWidth = 80,
			transient = true,
		},
		keys = {
			{
				"<leader>sr",
				function()
					require("grug-far").open({
						prefills = {
							search = vim.fn.expand("<cword>"),
							paths = vim.fn.expand("%"),
						},
					})
				end,
				desc = "Replace <cword> in file",
			},
			{
				"<leader>sr",
				function()
					require("grug-far").open({
						prefills = {
							paths = vim.fn.expand("%"),
						},
					})
				end,
				mode = { "v" },
				desc = "Replace selection in file",
			},
			{
				"<leader>sR",
				function()
					require("grug-far").open({
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
					require("grug-far").open({
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
