return {
	{
		"nvim-lualine/lualine.nvim",
		dependencies = {
			"folke/tokyonight.nvim",
		},
		event = "VeryLazy",
		opts = function(_, opts)
			local theme = require("tokyonight.colors").moon()

			local colors = {
				bg = theme.bg,
				fg = theme.fg,
				yellow = theme.yellow,
				cyan = theme.cyan,
				darkblue = theme.darkblue,
				green = theme.green,
				orange = theme.orange,
				magenta = theme.magenta,
				blue = theme.blue,
				red = theme.red,
			}

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

			opts.options.theme = "tokyonight"
			opts.options.component_separators = ""
			opts.options.section_separators = ""

			opts.sections = {
				lualine_a = {},
				lualine_b = {},
				lualine_c = {},
				lualine_x = {},
				lualine_y = {},
				lualine_z = {},
			}
			opts.inactive_sections = {
				lualine_a = {},
				lualine_b = {},
				lualine_c = {},
				lualine_x = {},
				lualine_y = {},
				lualine_z = {},
			}
			--
			-- Inserts a component in lualine_c at left section
			local function ins_left(component)
				table.insert(opts.sections.lualine_c, component)
			end

			-- Inserts a component in lualine_x ot right section
			local function ins_right(component)
				table.insert(opts.sections.lualine_x, component)
			end

			ins_left({
				function()
					return "▊"
				end,
				color = { fg = colors.blue }, -- Sets highlighting of component
				padding = { left = 0, right = 1 }, -- We don't need space before this
			})

			ins_left({
				-- mode component
				"mode",
				color = function()
					-- auto change color according to neovims mode
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
					return { fg = colors.bg, bg = mode_color[vim.fn.mode()] }
				end,
				separator = {
					left = "",
					right = "",
				},
			})

			ins_left({
				"filename",
				cond = conditions.buffer_not_empty,
				color = function()
					return vim.bo.modified and { fg = colors.red, gui = "bold" } or { fg = colors.fg, gui = "bold" }
				end,
				symbols = {
					modified = "",
					readonly = "",
				},
				padding = 2,
			})

			ins_left({
				"diagnostics",
				sources = { "nvim_diagnostic" },
				symbols = { error = " ", warn = " ", info = " " },
				diagnostics_color = {
					color_error = { fg = colors.red },
					color_warn = { fg = colors.yellow },
					color_info = { fg = colors.cyan },
				},
			})

			-- Insert mid section
			ins_left({
				function()
					return "%="
				end,
			})

			ins_left({
				-- Lsp server name
				function()
					local msg = "No Active Lsp"
					local buf_ft = vim.api.nvim_buf_get_option(0, "filetype")
					local clients = vim.lsp.get_active_clients()
					if next(clients) == nil then
						return msg
					end
					for _, client in ipairs(clients) do
						local filetypes = client.config.filetypes
						if filetypes and vim.fn.index(filetypes, buf_ft) ~= -1 then
							return client.name
						end
					end
					return msg
				end,
				icon = " LSP:",
				color = { fg = colors.fg, gui = "bold" },
			})

			-- Add components to right sections
			ins_right({
				"macro-recording",
				fmt = function()
					local recording_register = vim.fn.reg_recording()
					if recording_register == "" then
						return ""
					else
						return "Recording @" .. recording_register
					end
				end,
			})

			ins_right({
				function()
					return "%S"
				end,
			})

			ins_right({
				"o:encoding", -- option component same as &encoding in viml
				fmt = string.upper, -- I'm not sure why it's upper case either ;)
				cond = conditions.hide_in_width,
				color = { fg = colors.green, gui = "bold" },
			})

			ins_right({
				"branch",
				icon = "",
				color = { fg = colors.magenta, gui = "bold" },
			})

			ins_right({
				"diff",
				-- Is it me or the symbol for modified us really weird
				symbols = { added = " ", modified = "柳 ", removed = " " },
				diff_color = {
					added = { fg = colors.green },
					modified = { fg = colors.orange },
					removed = { fg = colors.red },
				},
				cond = conditions.hide_in_width,
			})

			ins_right({
				function()
					return "▊"
				end,
				color = { fg = colors.blue },
				padding = { left = 1 },
			})
		end,
	},
}
