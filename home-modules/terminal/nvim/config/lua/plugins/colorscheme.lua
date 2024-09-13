return {
	{
		"catppuccin/nvim",
		name = "catppuccin",
		opts = {
			kitty = false,
		},
	},
	{
		"folke/tokyonight.nvim",
		dependencies = {
			"catppuccin/nvim",
		},
		lazy = false,
		priority = 1000,
		opts = {
			style = "moon",
			plugins = {
				markdown = true,
			},
			---@param colors ColorScheme
			on_colors = function(colors)
				local macchiato = require("catppuccin.palettes").get_palette("macchiato")

				colors.bg = macchiato.base
				colors.bg_dark = macchiato.mantle
				colors.bg_highlight = macchiato.surface0
				colors.blue = macchiato.blue
				colors.blue0 = macchiato.sapphire
				colors.blue1 = macchiato.blue
				colors.blue2 = macchiato.lavender
				colors.blue5 = macchiato.blue
				colors.blue6 = macchiato.blue
				colors.blue7 = macchiato.blue
				colors.comment = macchiato.overlay1
				colors.cyan = macchiato.sapphire
				colors.dark3 = macchiato.surface2
				colors.dark5 = macchiato.overlay1
				colors.fg = macchiato.text
				colors.fg_dark = macchiato.surface2
				colors.fg_gutter = macchiato.surface1
				colors.green = macchiato.green
				colors.green1 = macchiato.sky
				colors.green2 = macchiato.teal
				colors.magenta = macchiato.mauve
				colors.magenta2 = macchiato.maroon
				colors.orange = macchiato.peach
				colors.purple = macchiato.pink
				colors.red = macchiato.red
				colors.red1 = macchiato.maroon
				colors.teal = macchiato.teal
				colors.terminal_black = macchiato.surface2
				colors.yellow = macchiato.yellow
				colors.git = {
					add = macchiato.green,
					change = macchiato.blue,
					delete = macchiato.red,
				}
			end,
			on_highlights = function(hl, c)
				hl.CursorLineNr = { fg = c.blue }
				hl.LineNr = { fg = c.fg_dark }
				hl.LineNrAbove = { link = "LineNr" }
				hl.LineNrBelow = { link = "LineNr" }
				hl.Visual = { bg = c.bg_highlight }
			end,
		},
		config = function(_, opts)
			local tokyonight = require("tokyonight")
			tokyonight.setup(opts)
			tokyonight.load()
		end,
	},
}
