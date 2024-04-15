return {
	{
		"nvimdev/dashboard-nvim",
		event = "VimEnter",
		opts = function()
			local logo = [[
                                                                             
               ████ ██████           █████      ██                     
              ███████████             █████                             
              █████████ ███████████████████ ███   ███████████   
             █████████  ███    █████████████ █████ ██████████████   
            █████████ ██████████ █████████ █████ █████ ████ █████   
          ███████████ ███    ███ █████████ █████ █████ ████ █████  
         ██████  █████████████████████ ████ █████ █████ ████ ██████ 
      ]]

			logo = string.rep("\n", 18) .. logo .. "\n\n"

			return {
				theme = "doom",
				config = {
					header = vim.split(logo, "\n"),
					center = {
						{
							action = "qa",
							desc = "",
							icon = "",
							key = "q",
							key_format = "",
						},
					},
					footer = {},
				},
			}
		end,
	},
	{
		"stevearc/dressing.nvim",
		opts = {},
	},
	{
		"folke/edgy.nvim",
		event = "VeryLazy",
		opts = {
			bottom = {
				{
					ft = "noice",
					filter = function(buf, win)
						return vim.api.nvim_win_get_config(win).relative == ""
					end,
				},
				"Trouble",
				{ ft = "qf", title = "QuickFix" },
			},
			right = {
				{ ft = "help" },
			},
			options = {
				bottom = { size = 0.5 },
				right = { size = 0.5 },
			},
		},
	},
	{
		"smjonas/inc-rename.nvim",
		cmd = "IncRename",
		config = function()
			require("inc_rename").setup({})
		end,
		keys = {
			{
				"<leader>cr",
				":IncRename ",
				desc = "Rename variable",
			},
		},
	},
	{
		"lukas-reineke/indent-blankline.nvim",
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = {
			indent = {
				char = "│",
				tab_char = "│",
			},
			scope = { enabled = false },
			exclude = {
				filetypes = {
					"help",
					"dashboard",
					"Trouble",
					"trouble",
					"lazy",
					"mason",
					"notify",
				},
			},
		},
		main = "ibl",
	},
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
			opts.options = opts.options or {}

			opts.options.theme = "tokyonight"
			opts.options.component_separators = ""
			opts.options.section_separators = ""
			opts.options.disabled_filetypes = {
				statusline = { "dashboard", "lazy" },
			}

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
					return { fg = colors.bg, bg = mode_color[vim.fn.mode()], gui = "bold" }
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
	{
		"echasnovski/mini.indentscope",
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = {
			symbol = "│",
			options = { try_as_border = true },
		},
		init = function()
			vim.api.nvim_create_autocmd("FileType", {
				pattern = {
					"help",
					"alpha",
					"dashboard",
					"neo-tree",
					"Trouble",
					"trouble",
					"lazy",
					"mason",
					"notify",
					"toggleterm",
					"lazyterm",
				},
				callback = function()
					vim.b.miniindentscope_disable = true
				end,
			})
		end,
	},
	{
		"echasnovski/mini.hipatterns",
		config = function()
			local hipatterns = require("mini.hipatterns")
			hipatterns.setup({
				highlighters = {
					fixme = { pattern = "%f[%w]()FIXME()%f[%W]", group = "MiniHipatternsFixme" },
					hack = { pattern = "%f[%w]()HACK()%f[%W]", group = "MiniHipatternsHack" },
					todo = { pattern = "%f[%w]()TODO()%f[%W]", group = "MiniHipatternsTodo" },
					note = { pattern = "%f[%w]()NOTE()%f[%W]", group = "MiniHipatternsNote" },
					hex_color = hipatterns.gen_highlighter.hex_color(),
				},
			})
		end,
	},
	{
		"folke/noice.nvim",
		dependencies = {
			"stevearc/dressing.nvim",
			"smjonas/inc-rename.nvim",
			"MunifTanjim/nui.nvim",
			"rcarriga/nvim-notify",
		},
		event = "VeryLazy",
		opts = {
			presets = {
				bottom_search = true, -- use a classic bottom cmdline for search
				command_palette = true, -- position the cmdline and popupmenu together
				long_message_to_split = true, -- long messages will be sent to a split
				inc_rename = true, -- enables an input dialog for inc-rename.nvim
				lsp_doc_border = true, -- add a border to hover docs and signature help
			},
			lsp = {
				hover = {
					view = "hover",
				},
			},
			views = {
				hover = {
					border = {
						style = "rounded",
						padding = { 0, 1 },
					},
					position = {
						row = 2,
						col = 2,
					},
				},
			},
		},
		keys = {
			{
				"<leader>nl",
				function()
					require("noice").cmd("last")
				end,
				desc = "Noice last message",
			},
			{
				"<leader>nh",
				function()
					require("noice").cmd("history")
				end,
				desc = "Noice history",
			},
			{
				"<leader>na",
				function()
					require("noice").cmd("all")
				end,
				desc = "Noice all",
			},
			{
				"<leader>nd",
				function()
					require("noice").cmd("dismiss")
				end,
				desc = "Dismiss all",
			},
		},
	},
	{
		"rcarriga/nvim-notify",
		opts = {
			stages = "static",
			max_width = function()
				return math.floor(vim.o.columns * 0.5)
			end,
		},
		init = function()
			vim.notify = require("notify")
		end,
	},
	{
		"nvim-tree/nvim-web-devicons",
		opts = {},
	},
	{
		"RRethy/vim-illuminate",
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = {
			delay = 200,
			large_file_cutoff = 2000,
			large_file_overrides = {
				providers = { "lsp" },
			},
		},
		config = function(_, opts)
			require("illuminate").configure(opts)
		end,
	},
	{
		"folke/which-key.nvim",
		event = "VeryLazy",
		config = function(_, opts)
			local wk = require("which-key")
			wk.setup(opts)
			wk.register({
				mode = { "n", "v" },
				["g"] = { name = "+goto" },
				["<leader>b"] = { name = "+buffers" },
				["<leader>c"] = { name = "+code" },
				["<leader>f"] = { name = "+file/find" },
				["<leader>g"] = { name = "+git" },
				["<leader>h"] = { name = "+harpoon" },
				["<leader>n"] = { name = "+notifications" },
				["<leader>q"] = { name = "+quit" },
				["<leader>s"] = { name = "+search" },
				["<leader>t"] = { name = "+toggle" },
				["<leader>w"] = { name = "+windows" },
				["<leader>x"] = { name = "+diagnostics/quickfix" },
			})
		end,
	},
}
