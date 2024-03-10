return {
	{
		"Rolv-Apneseth/tfm.nvim",
		opts = {
			replace_netrw = true,
		},
		keys = {
			{
				"<leader>e",
				function()
					require("tfm").open(vim.fn.expand("%"))
				end,
				desc = "File manager",
			},
		},
	},
}
