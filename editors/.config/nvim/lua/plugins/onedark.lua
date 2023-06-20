return {
	{
		"LazyVim/LazyVim",
		opts = {
			colorscheme = "onedark",
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
