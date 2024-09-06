return {
	{
		"folke/tokyonight.nvim",
		lazy = false,
		priority = 1000,
		opts = {
			style = "moon",
			plugins = {
				markdown = true,
			},
			on_highlights = function(hl, c)
				hl.CursorLineNr = { fg = c.blue }
				hl.LineNr = { fg = c.fg_dark }
				hl.LineNrAbove = hl.LineNr
				hl.LineNrBelow = hl.LineNr
			end,
		},
		config = function(_, opts)
			local tokyonight = require("tokyonight")
			tokyonight.setup(opts)
			tokyonight.load()
		end,
	},
}
