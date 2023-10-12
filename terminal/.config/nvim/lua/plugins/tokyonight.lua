return {
	{
		"folke/tokyonight.nvim",
		lazy = true,
		opts = {
			style = "moon",
			on_highlights = function(highlights, colors)
				highlights.LineNr = { fg = colors.fg_dark }
				highlights.CursorLineNr = { fg = colors.fg_dark }
			end,
		},
	},
}
