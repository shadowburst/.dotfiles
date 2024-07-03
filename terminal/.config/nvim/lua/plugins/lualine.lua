return {
	{
		"nvim-lualine/lualine.nvim",
		dependencies = {
			"folke/tokyonight.nvim",
			{
				"nvim-tree/nvim-web-devicons",
				opts = {},
			},
		},
		event = "VeryLazy",
		opts = function()
			local colors = require("tokyonight.colors").setup()

			local theme = require("lualine.themes.tokyonight")

			theme.normal.c.bg = colors.bg

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
						statusline = { "dashboard", "lazy" },
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
									n = colors.green,
									i = colors.blue,
									v = colors.yellow,
									[""] = colors.yellow,
									V = colors.yellow,
									c = colors.magenta,
									no = colors.red,
									s = colors.orange,
									S = colors.orange,
									[""] = colors.orange,
									ic = colors.yellow,
									R = colors.magenta,
									Rv = colors.magenta,
									cv = colors.red,
									ce = colors.red,
									r = colors.cyan,
									rm = colors.cyan,
									["r?"] = colors.cyan,
									["!"] = colors.red,
									t = colors.red,
								}
								return { fg = colors.bg, bg = mode_color[vim.fn.mode()], gui = "bold" }
							end,
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
									or { fg = colors.fg, gui = "bold" }
							end,
						},
						{
							"diagnostics",
							sources = { "nvim_diagnostic" },
							symbols = { error = " ", warn = " ", info = " " },
							diagnostics_color = {
								color_error = { fg = colors.red },
								color_warn = { fg = colors.yellow },
								color_info = { fg = colors.cyan },
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
							symbols = { added = " ", modified = "柳", removed = " " },
							diff_color = {
								added = { fg = colors.green },
								modified = { fg = colors.orange },
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
							color = { fg = colors.bg, bg = colors.magenta, gui = "bold" },
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
