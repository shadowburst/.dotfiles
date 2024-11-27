return {
	{
		"rasulomaroff/reactive.nvim",
		dependencies = {
			"catppuccin/nvim",
		},
		lazy = false,
		opts = function()
			---@type CtpColors<string>
			local palette = require("catppuccin.palettes").get_palette(require("catppuccin").options.flavour)

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
											ReactiveCursor = { bg = palette.sapphire },
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
											CursorLine = { bg = darken(palette.sapphire, 0.4) },
											CursorLineNr = { bg = darken(palette.sapphire, 0.4) },
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
