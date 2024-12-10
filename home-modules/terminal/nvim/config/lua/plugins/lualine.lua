return {
	{
		"nvim-lualine/lualine.nvim",
		dependencies = {
			"cbochs/grapple.nvim",
			"echasnovski/mini.icons",
			"catppuccin/nvim",
		},
		event = { "VeryLazy" },
		opts = function()
			---@type CtpColors<string>
			local palette = require("catppuccin.palettes").get_palette(require("catppuccin").options.flavour)

			local theme = require("lualine.themes.catppuccin-macchiato")

			theme.normal.c.bg = nil

			local conditions = {
				buffer_not_empty = function()
					return vim.fn.empty(vim.fn.expand("%:t")) ~= 1
				end,
				hide_in_width = function()
					return vim.fn.winwidth(0) > 80
				end,
				check_git_workspace = function()
					local filepath = vim.fn.expand("%:p:h")
					local gitdir = vim.fn.finddir(".git", filepath .. ";")
					return gitdir and #gitdir > 0 and #gitdir < #filepath
				end,
				recording_macro = function()
					return vim.fn.reg_recording() ~= ""
				end,
			}

			return {
				options = {
					theme = theme,
					component_separators = "",
					section_separators = "",
					disabled_filetypes = {
						statusline = { "snacks_dashboard", "lazy" },
					},
				},
				sections = {
					lualine_a = {},
					lualine_b = {},
					lualine_c = {
						{
							function()
								return "▊"
							end,
							color = { fg = palette.blue },
							padding = { left = 0, right = 1 },
						},
						{
							"mode",
							separator = {
								left = "",
								right = "",
							},
							padding = 1,
							color = function()
								local mode_color = {
									n = palette.blue,
									no = palette.yellow,
									nov = palette.yellow,
									i = palette.teal,
									ic = palette.teal,
									v = palette.mauve,
									[""] = palette.mauve,
									V = palette.mauve,
									c = palette.lavender,
									cv = palette.lavender,
									ce = palette.lavender,
									s = palette.pink,
									S = palette.pink,
									[""] = palette.pink,
									R = palette.sapphire,
									Rv = palette.sapphire,
									r = palette.sky,
									rm = palette.sky,
									["r?"] = palette.sky,
									["!"] = palette.red,
									t = palette.red,
								}
								return { fg = palette.base, bg = mode_color[vim.fn.mode()], gui = "bold" }
							end,
						},
						{ "location" },
						{
							"diagnostics",
							sources = { "nvim_diagnostic" },
							symbols = { error = " ", warn = " ", info = " " },
							diagnostics_color = {
								color_error = { fg = palette.red },
								color_warn = { fg = palette.yellow },
								color_info = { fg = palette.sky },
							},
						},
						{
							function()
								local grapple = require("grapple")
								return grapple.app().settings.statusline.icon .. grapple.name_or_index()
							end,
							cond = function()
								return package.loaded["grapple"] and require("grapple").exists()
							end,
							padding = { left = 1, right = 0 },
							color = { fg = palette.blue },
						},
						{
							"filename",
							cond = conditions.buffer_not_empty,
							padding = 1,
							symbols = {
								modified = "",
								readonly = "",
							},
							color = function()
								return vim.bo.modified and { fg = palette.red, gui = "bold" }
									or { fg = palette.text, gui = "bold" }
							end,
						},
						{
							function()
								return "%="
							end,
						},
						{
							"macro-recording",
							fmt = function()
								return "Recording @" .. vim.fn.reg_recording()
							end,
							cond = conditions.recording_macro,
							separator = {
								left = "",
								right = "",
							},
							padding = 1,
							color = { fg = palette.base, bg = palette.maroon, gui = "bold" },
						},
					},
					lualine_x = {
						{
							"diff",
							cond = conditions.hide_in_width,
							symbols = { added = " ", modified = " ", removed = " " },
						},
						{
							"branch",
							cond = conditions.check_git_workspace,
							separator = {
								left = "",
								right = "",
							},
							padding = 1,
							icon = "",
							color = { fg = palette.base, bg = palette.mauve, gui = "bold" },
						},
						{
							function()
								return "▊"
							end,
							color = { fg = palette.blue },
							padding = { left = 1, right = 0 },
						},
					},
					lualine_y = {},
					lualine_z = {},
				},
				inactive_sections = {
					lualine_a = {},
					lualine_b = {},
					lualine_c = {},
					lualine_x = {},
					lualine_y = {},
					lualine_z = {},
				},
			}
		end,
	},
}
