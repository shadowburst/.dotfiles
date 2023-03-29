return {
	{
		"navarasu/onedark.nvim",
		config = function()
			require("onedark").setup({
				style = "dark",
				transparent = false,
			})
		end,
	},
	{
		"LazyVim/LazyVim",
		opts = {
			colorscheme = "onedark",
		},
	},
	{
		"norcalli/nvim-colorizer.lua",
		opts = {
			"*",
		},
	},
	{
		"echasnovski/mini.animate",
		event = "VeryLazy",
		opts = {
			cursor = {
				enable = false,
			},
		},
	},
}
