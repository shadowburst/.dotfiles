return {
	{
		"svampkorg/moody.nvim",
		event = { "ModeChanged", "BufWinEnter", "WinEnter" },
		dependencies = {
			"catppuccin/nvim",
		},
		opts = function()
			---@type CtpColors<string>
			local palette = require("catppuccin.palettes").get_palette(require("catppuccin").options.flavour)

			return {
				disabled_filetypes = { "TelescopePrompt" },
				blends = {
					normal = 0.3,
					insert = 0.3,
					visual = 0.3,
					command = 0.3,
					operator = 0.3,
					replace = 0.3,
					select = 0.3,
					terminal = 0.3,
					terminal_n = 0.3,
				},
				colors = {
					normal = palette.blue,
					insert = palette.teal,
					visual = palette.mauve,
					command = palette.lavender,
					operator = palette.sapphire,
					replace = palette.sky,
					select = palette.pink,
					terminal = palette.red,
					terminal_n = palette.red,
				},
				recording = {
					enabled = true,
				},
			}
		end,
	},
}
