return {
	{
		"lewis6991/gitsigns.nvim",
		event = { "BufReadPre", "BufNewFile" },
		opts = {
			current_line_blame = true,
			on_attach = function(buffer)
				local gs = package.loaded.gitsigns

				local function map(mode, l, r, desc)
					vim.keymap.set(mode, l, r, { buffer = buffer, desc = desc })
				end

				map("n", "]h", gs.next_hunk, "Next Hunk")
				map("n", "[h", gs.prev_hunk, "Prev Hunk")
				map("n", "<leader>gd", function()
					gs.diffthis("~")
				end, "Diff this buffer")
				map("n", "<leader>gp", gs.preview_hunk, "Preview Hunk")
				map({ "n", "v" }, "<leader>gr", ":Gitsigns reset_hunk<CR>", "Reset Hunk")
			end,
		},
	},
	{
		"nvim-neo-tree/neo-tree.nvim",
		keys = {
			{ "<leader>E", false },
		},
		opts = function()
			vim.api.nvim_set_hl(0, "NeoTreeGitUntracked", { italic = true, fg = "#98be65" })

			return {
				filesystem = {
					bind_to_cwd = true,
					follow_current_file = true,
					group_empty_dirs = true,
					scan_mode = "deep",
					cwd_target = {
						sidebar = "window",
					},
					filtered_items = {
						visible = true,
						hide_dotfiles = false,
						-- hide_gitignored = false,
						hide_hidden = false,
						hide_by_name = {
							".git",
							"node_modules",
							"vendor",
						},
					},
				},
				window = {
					mappings = {
						["<space>"] = "none",
						["h"] = "close_node",
						["l"] = "open",
					},
				},
				default_component_configs = {
					indent = {
						with_expanders = true,
						expander_collapsed = "",
						expander_expanded = "",
						expander_highlight = "NeoTreeExpander",
					},
				},
				event_handlers = {
					{
						event = "file_opened",
						handler = function()
							require("neo-tree").close_all()
						end,
					},
				},
			}
		end,
	},
	{
		"lambdalisue/suda.vim",
		lazy = false,
		keys = {
			{
				"<leader>fu",
				"<cmd>SudaRead<cr>",
				desc = "Sudo this file",
			},
		},
	},
	{
		"telescope.nvim",
		dependencies = {
			{
				"nvim-telescope/telescope-fzf-native.nvim",
				build = "make",
				config = function()
					require("telescope").load_extension("fzf")
				end,
			},
			{
				"nvim-telescope/telescope-file-browser.nvim",
				keys = {
					{
						"<leader>.",
						"<cmd>Telescope file_browser path=%:p:h=%:p:h<cr>",
						desc = "Browse files",
					},
				},
				config = function()
					require("telescope").load_extension("file_browser")
				end,
			},
			{
				"nvim-telescope/telescope-project.nvim",
				keys = {
					{
						"<leader>pp",
						'<cmd>lua require("telescope").extensions.project.project()<cr>',
						desc = "Switch project",
					},
				},
				config = function()
					require("telescope").load_extension("project")
				end,
			},
		},
		keys = {
			{ "<leader>cD", "<cmd>Telescope diagnostics<cr>", desc = "Diagnostics" },
			{ "<leader>hC", "<cmd>Telescope command_history<cr>", desc = "Command History" },
			{ "<leader>hc", "<cmd>Telescope commands<cr>", desc = "Commands" },
			{ "<leader>hh", "<cmd>Telescope help_tags<cr>", desc = "Help Pages" },
			{ "<leader>hk", "<cmd>Telescope keymaps<cr>", desc = "Key Maps" },
			{ "<leader>hm", "<cmd>Telescope man_pages<cr>", desc = "Man Pages" },
			{ "<leader>ho", "<cmd>Telescope vim_options<cr>", desc = "Options" },
			{ "<leader>sa", false },
			{ "<leader>sb", false },
			{ "<leader>sc", false },
			{ "<leader>sC", false },
			{ "<leader>sd", false },
			{ "<leader>sG", "<cmd>Telescope live_grep grep_open_files=true<cr>", desc = "Grep (Open buffers)" },
			{ "<leader>sh", false },
			{ "<leader>sH", false },
			{ "<leader>sk", false },
			{ "<leader>sm", false },
			{ "<leader>so", false },
			{ "<leader>ss", "<cmd>Telescope current_buffer_fuzzy_find<cr>", desc = "Search in buffer" },
			{ "<leader>sS", false },
			{ "<leader>sW", false },
		},
		opts = {
			defaults = {
				file_ignore_patterns = {
					"%.git/.*",
					"%.vim/.*",
					"%.idea/.*",
					"%.vscode/.*",
					"%.history/.*",
					"node_modules/.*",
					"vendor/.*",
				},
				layout_config = { prompt_position = "top" },
				sorting_strategy = "ascending",
				mappings = {
					i = {
						["<Tab>"] = function(...)
							require("telescope.actions").move_selection_worse(...)
						end,
						["<S-Tab>"] = function(...)
							require("telescope.actions").move_selection_better(...)
						end,
					},
				},
			},
			pickers = {
				find_files = {
					hidden = true,
				},
				live_grep = {
					additional_args = {
						"--hidden",
					},
					max_results = 1000,
				},
				grep_string = {
					additional_args = {
						"--hidden",
					},
				},
			},
			extensions = {
				project = {
					hidden_files = true,
				},
			},
		},
	},
	{
		"akinsho/toggleterm.nvim",
		event = "VeryLazy",
		keys = {
			{
				"²",
				"<cmd>ToggleTerm<cr>",
				desc = "Open terminal",
			},
			{
				"<leader>ot",
				"<cmd>ToggleTerm<cr>",
				desc = "Open terminal",
			},
			{
				"²",
				"<cmd>ToggleTerm<cr>",
				desc = "Close terminal",
				mode = "t",
			},
			{
				"<C-h>",
				[[<C-\><C-n><C-W>h]],
				desc = "Go to left window",
				mode = "t",
			},
			{
				"<C-j>",
				[[<C-\><C-n><C-W>j]],
				desc = "Go to lower window",
				mode = "t",
			},
			{
				"<C-k>",
				[[<C-\><C-n><C-W>k]],
				desc = "Go to upper window",
				mode = "t",
			},
			{
				"<C-l>",
				[[<C-\><C-n><C-W>l]],
				desc = "Go to right window",
				mode = "t",
			},
			{
				"<C-é>",
				"<cmd>2ToggleTerm<cr>",
				desc = "Open a second terminal",
				mode = "t",
			},
		},
		config = function()
			require("toggleterm").setup({
				size = 15,
				open_mapping = [[<c-\>]],
				hide_numbers = true,
				shade_filetypes = {},
				shade_terminals = false,
				shading_factor = 2,
				start_in_insert = true,
				insert_mappings = true,
				persist_size = true,
				direction = "horizontal",
				close_on_exit = true,
				shell = vim.o.shell,
				float_opts = {
					border = "curved",
					winblend = 0,
					highlights = {
						border = "Normal",
						background = "Normal",
					},
				},
			})

			local Terminal = require("toggleterm.terminal").Terminal

			local lazygit = Terminal:new({ cmd = "lazygit", hidden = true, direction = "float" })
			local lazydocker = Terminal:new({ cmd = "lazydocker", hidden = true, direction = "float" })

			local map = vim.keymap.set

			map("n", "<leader>od", function()
				lazydocker:toggle()
			end, { desc = "Open Lazydocker", silent = true })

			map("n", "<leader>og", function()
				lazygit:toggle()
			end, { desc = "Open Lazygit", silent = true })
		end,
	},
	{
		"folke/which-key.nvim",
		event = "VeryLazy",
		opts = {
			plugins = { spelling = true },
		},
		config = function(_, opts)
			local wk = require("which-key")
			wk.setup(opts)
			local keymaps = {
				mode = { "n", "v" },
				["g"] = { name = "+goto" },
				["]"] = { name = "+next" },
				["["] = { name = "+prev" },
				["<leader><tab>"] = { name = "+tabs" },
				["<leader>b"] = { name = "+buffer" },
				["<leader>c"] = { name = "+code" },
				["<leader>f"] = { name = "+file/find" },
				["<leader>g"] = { name = "+git" },
				["<leader>o"] = { name = "+open" },
				["<leader>q"] = { name = "+quit/session" },
				["<leader>p"] = { name = "+projects" },
				["<leader>s"] = { name = "+search" },
				["<leader>sn"] = { name = "+noice" },
				["<leader>u"] = { name = "+ui" },
				["<leader>w"] = { name = "+windows" },
				["<leader>x"] = { name = "+diagnostics/quickfix" },
			}
			wk.register(keymaps)
		end,
	},
}
