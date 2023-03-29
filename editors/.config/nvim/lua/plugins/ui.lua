return {
	-- {
	--     'navarasu/onedark.nvim',
	--     config = function()
	--       require('onedark').setup({
	--           style = 'dark',
	--           transparent = false,
	--       })
	--     end,
	-- },
	-- {
	--     'LazyVim/LazyVim',
	--     opts = {
	--         colorscheme = 'onedark',
	--     },
	-- },
	{
		"folke/tokyonight.nvim",
		lazy = true,
		opts = { style = "moon" },
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
