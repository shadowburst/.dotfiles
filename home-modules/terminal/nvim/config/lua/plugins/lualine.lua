return {
	{
		"nvim-lualine/lualine.nvim",
		dependencies = {
			"cbochs/grapple.nvim",
			"echasnovski/mini.icons",
			"catppuccin/nvim",
		},
		event = "VeryLazy",
		opts = function()
			---@type CtpColors<string>
			local colors = require("catppuccin.palettes").get_palette("macchiato")

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
							color = { fg = colors.blue },
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
									n = colors.blue,
									no = colors.yellow,
									nov = colors.yellow,
									i = colors.teal,
									ic = colors.teal,
									v = colors.mauve,
									[""] = colors.mauve,
									V = colors.mauve,
									c = colors.lavender,
									cv = colors.lavender,
									ce = colors.lavender,
									s = colors.pink,
									S = colors.pink,
									[""] = colors.pink,
									R = colors.sapphire,
									Rv = colors.sapphire,
									r = colors.sky,
									rm = colors.sky,
									["r?"] = colors.sky,
									["!"] = colors.red,
									t = colors.red,
								}
								return { fg = colors.base, bg = mode_color[vim.fn.mode()], gui = "bold" }
							end,
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
							color = { fg = colors.blue },
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
								return vim.bo.modified and { fg = colors.red, gui = "bold" }
									or { fg = colors.text, gui = "bold" }
							end,
						},
						{
							"diagnostics",
							sources = { "nvim_diagnostic" },
							symbols = { error = " ", warn = " ", info = " " },
							diagnostics_color = {
								color_error = { fg = colors.red },
								color_warn = { fg = colors.yellow },
								color_info = { fg = colors.sky },
							},
						},
					},
					lualine_x = {
						{
							"macro-recording",
							fmt = function()
								local recording_register = vim.fn.reg_recording()
								if recording_register == "" then
									return ""
								else
									return "Recording @" .. recording_register
								end
							end,
						},
						{
							"diff",
							cond = conditions.hide_in_width,
							symbols = { added = " ", modified = " ", removed = " " },
							diff_color = {
								added = { fg = colors.green },
								modified = { fg = colors.peach },
								removed = { fg = colors.red },
							},
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
							color = { fg = colors.base, bg = colors.mauve, gui = "bold" },
						},
						{
							function()
								return "▊"
							end,
							color = { fg = colors.blue },
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
