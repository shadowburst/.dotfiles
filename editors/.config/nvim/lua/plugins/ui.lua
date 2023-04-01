return {
	{
		"LazyVim/LazyVim",
		opts = {
			colorscheme = "onedark",
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
	{
		"norcalli/nvim-colorizer.lua",
		opts = {
			"*",
		},
	},
	{
		"navarasu/onedark.nvim",
		config = function()
			require("onedark").setup({
				style = "dark",
				transparent = false,
			})
		end,
	},
}
