return {
	{
		"catppuccin/nvim",
		name = "catppuccin",
		lazy = false,
		priority = 1000,
		opts = {
			flavour = "macchiato",
			kitty = false,
			custom_highlights = function(colors)
				return {
					LineNr = { fg = colors.surface2 },
					LineNrAbove = { link = "LineNr" },
					LineNrBelow = { link = "LineNr" },
					Pmenu = { bg = colors.mantle, fg = colors.blue },
					NormalFloat = { bg = colors.mantle },
					FloatBorder = { bg = colors.mantle },
					FloatTitle = { bg = colors.mantle },
					TelescopeNormal = { link = "NormalFloat" },
					TelescopeSelectionCaret = { fg = colors.red, bg = colors.surface0 },
					BlinkCmpMenuBorder = { link = "Pmenu" },
					BlinkCmpSignatureHelpBorder = { link = "Pmenu" },
					BlinkCmpDocBorder = { link = "Pmenu" },
				}
			end,
			default_integrations = false,
			integrations = {
				blink_cmp = true,
				dashboard = true,
				diffview = true,
				flash = true,
				gitsigns = true,
				grug_far = true,
				illuminate = {
					enabled = true,
					lsp = true,
				},
				lsp_trouble = true,
				mason = true,
				mini = {
					enabled = true,
					indentscope_color = "lavender",
				},
				native_lsp = {
					enabled = true,
					virtual_text = {
						errors = { "italic" },
						hints = { "italic" },
						warnings = { "italic" },
						information = { "italic" },
						ok = { "italic" },
					},
					underlines = {
						errors = { "underline" },
						hints = { "underline" },
						warnings = { "underline" },
						information = { "underline" },
						ok = { "underline" },
					},
					inlay_hints = {
						background = true,
					},
				},
				neogit = true,
				noice = true,
				notify = true,
				render_markdown = true,
				snacks = true,
				telescope = {
					enabled = true,
				},
				treesitter = true,
				treesitter_context = true,
				which_key = true,
			},
		},
		config = function(_, opts)
			require("catppuccin").setup(opts)
			vim.cmd.colorscheme("catppuccin")
		end,
	},
}
