return {
	{
		"Rolv-Apneseth/tfm.nvim",
		lazy = false,
		opts = {
			replace_netrw = true,
			keybindings = {
				["<esc><esc>"] = "<esc>",
			},
			ui = {
				border = "none",
			},
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
