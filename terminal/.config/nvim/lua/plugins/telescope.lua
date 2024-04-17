return {
	{
		"telescope.nvim",
		dependencies = {
			"folke/edgy.nvim",
			"rcarriga/nvim-notify",
			{
				"nvim-telescope/telescope-fzf-native.nvim",
				build = "make",
				enabled = vim.fn.executable("make") == 1,
			},
		},
		opts = {
			defaults = {
				prompt_prefix = " ",
				selection_caret = " ",
				layout_config = {
					prompt_position = "top",
				},
				sorting_strategy = "ascending",
				get_selection_window = function()
					require("edgy").goto_main()
					return 0
				end,
				file_ignore_patterns = {
					"^.git/*",
					"^.vim/*",
					"^.idea/*",
					"^.vscode/*",
					"^.history/*",
					"^node_modules/*",
					"^vendor/*",
				},
				mappings = {
					i = {
						["<C-y>"] = function(...)
							require("telescope.actions").file_edit(...)
						end,
						["<C-v>"] = function(...)
							require("telescope.actions").toggle_all(...)
						end,
						["<C-space>"] = function(...)
							require("telescope.actions").toggle_selection(...)
						end,
					},
					["n"] = {
						["<C-y>"] = function(...)
							require("telescope.actions").file_edit(...)
						end,
						["v"] = function(...)
							require("telescope.actions").toggle_all(...)
						end,
						["<space>"] = function(...)
							require("telescope.actions").toggle_selection(...)
						end,
					},
				},
			},
			pickers = {
				buffers = {
					sort_mru = true,
					sort_lastused = true,
				},
				find_files = {
					hidden = true,
					no_ignore = true,
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
				current_buffer_fuzzy_find = {
					preview = false,
				},
			},
		},
		config = function(_, opts)
			local telescope = require("telescope")

			telescope.setup(opts)
			pcall(telescope.load_extension, "fzf")
			pcall(telescope.load_extension, "notify")
		end,
		keys = {
			{ "<leader><leader>", "<cmd>Telescope find_files<cr>", desc = "Find files" },
			{ "<leader>,", "<cmd>Telescope buffers<cr>", desc = "Switch buffer" },
			{ "<leader>/", "<cmd>Telescope live_grep<cr>", desc = "Grep in files" },
			{ "<leader>:", "<cmd>Telescope command_history<cr>", desc = "Command history" },
			{
				"<leader>.",
				function()
					require("telescope.builtin").find_files({ cwd = require("telescope.utils").buffer_dir() })
				end,
				desc = "Find files (cwd)",
			},
			-- Files
			{ "<leader>fr", "<cmd>Telescope oldfiles only_cwd=true<cr>", desc = "Recent files" },
			-- Git
			{ "<leader>gc", "<cmd>Telescope git_commits<CR>", desc = "Commits" },
			{ "<leader>gf", "<cmd>Telescope git_bcommits<CR>", desc = "Buffer commits" },
			{ "<leader>gs", "<cmd>Telescope git_status<CR>", desc = "Status" },
			-- Notifications
			{ "<leader>nn", "<cmd>Telescope notify<cr>", desc = "Notifications" },
			-- Search
			{ "<leader>sb", "<cmd>Telescope current_buffer_fuzzy_find<cr>", desc = "Search in buffer" },
			{ "<leader>sc", "<cmd>Telescope commands<cr>", desc = "Commands" },
			{ "<leader>sd", "<cmd>Telescope diagnostics bufnr=0<cr>", desc = "Document diagnostics" },
			{ "<leader>sD", "<cmd>Telescope diagnostics<cr>", desc = "Workspace diagnostics" },
			{ "<leader>sg", "<cmd>Telescope live_grep grep_open_files=true<cr>", desc = "Grep (open buffers)" },
			{ "<leader>sh", "<cmd>Telescope help_tags<cr>", desc = "Help pages" },
			{ "<leader>sH", "<cmd>Telescope highlights<cr>", desc = "Search highlight groups" },
			{ "<leader>sk", "<cmd>Telescope keymaps<cr>", desc = "Key maps" },
			{ "<leader>sM", "<cmd>Telescope man_pages<cr>", desc = "Man pages" },
			{ "<leader>sm", "<cmd>Telescope marks<cr>", desc = "Jump to mark" },
			{ "<leader>so", "<cmd>Telescope vim_options<cr>", desc = "Options" },
			{ "<leader>ss", "<cmd>Telescope lsp_document_symbols<cr>", desc = "Document symbols" },
			{ "<leader>sS", "<cmd>Telescope lsp_dynamic_workspace_symbols<cr>", desc = "Workspace symbols" },
			{ "<leader>sw", "<cmd>Telescope grep_string<cr>", desc = "Word" },
		},
	},
}
