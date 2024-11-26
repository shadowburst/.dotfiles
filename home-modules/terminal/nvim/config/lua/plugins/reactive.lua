return {
	{
		"rasulomaroff/reactive.nvim",
		dependencies = {
			"catppuccin/nvim",
		},
		lazy = false,
		opts = function()
			---@type CtpColors<string>
			local colors = require("catppuccin.palettes").get_palette("macchiato")

			local darken = require("catppuccin.utils.colors").darken

			---@module 'reactive'
			---@type Reactive.Config
			return {
				load = { "catppuccin-macchiato-cursor", "catppuccin-macchiato-cursorline" },
				configs = {
					["catppuccin-macchiato-cursor"] = {
						modes = {
							no = {
								operators = {
									["g@"] = {
										hl = {
											ReactiveCursor = { bg = colors.yellow },
										},
									},
								},
							},
						},
					},
					["catppuccin-macchiato-cursorline"] = {
						modes = {
							no = {
								operators = {
									["g@"] = {
										winhl = {
											CursorLine = { bg = darken(colors.yellow, 0.3) },
											CursorLineNr = { bg = darken(colors.yellow, 0.3) },
										},
									},
								},
							},
						},
					},
				},
			}
		end,
	},
}
