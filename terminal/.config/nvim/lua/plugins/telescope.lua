return {
	{
		"telescope.nvim",
		dependencies = {
			"folke/edgy.nvim",
			"echasnovski/mini.icons",
			"rcarriga/nvim-notify",
			{
				"nvim-telescope/telescope-fzf-native.nvim",
				build = "make",
				enabled = vim.fn.executable("make") == 1,
			},
			"folke/tokyonight.nvim",
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
				cache_picker = {
					num_pickers = 15,
					limit_entries = 100,
					ignore_empty_prompts = true,
				},
				mappings = {
					i = {
						["<C-y>"] = function(...)
							require("telescope.actions").file_edit(...)
						end,
						["<C-s>"] = function(...)
							require("telescope.actions").file_split(...)
						end,
						["<C-space>"] = function(...)
							require("telescope.actions").toggle_selection(...)
						end,
					},
					["n"] = {
						["<C-y>"] = function(...)
							require("telescope.actions").file_edit(...)
						end,
					},
				},
			},
			pickers = {
				buffers = {
					ignore_current_buffer = true,
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

			local colors = require("tokyonight.colors").setup()
			vim.api.nvim_set_hl(
				0,
				"TelescopeSelectionCaret",
				{ fg = colors.magenta2, bg = vim.api.nvim_get_hl(0, { name = "Visual" }).bg }
			)
		end,
		keys = {
			{ "<leader><leader>", "<cmd>Telescope find_files<cr>", desc = "Find files" },
			{ "<leader>,", "<cmd>Telescope buffers<cr>", desc = "Switch buffer" },
			{ "<leader>/", "<cmd>Telescope live_grep<cr>", desc = "Grep in files" },
			{ "<leader>:", "<cmd>Telescope command_history<cr>", desc = "Command history" },
			{ "<leader>.", "<cmd>Telescope resume<cr>", desc = "Repeat last search" },
			-- Files
			{ "<leader>fr", "<cmd>Telescope oldfiles only_cwd=true<cr>", desc = "Recent files" },
			-- Git
			{ "<leader>gc", "<cmd>Telescope git_commits<CR>", desc = "Commits" },
			{ "<leader>gf", "<cmd>Telescope git_bcommits<CR>", desc = "Buffer commits" },
			{ "<leader>gs", "<cmd>Telescope git_status<CR>", desc = "Status" },
			-- Notifications
			{ "<leader>nn", "<cmd>Telescope notify<cr>", desc = "Notifications" },
			-- Search
			{
				"<leader>sw",
				function()
					require("telescope.builtin").live_grep({
						search_dirs = { vim.fn.expand("%:p") },
					})
				end,
				desc = "In buffer",
			},
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
			{ "<leader>sp", "<cmd>Telescope pickers<cr>", desc = "Pickers" },
			{ "<leader>ss", "<cmd>Telescope lsp_document_symbols<cr>", desc = "Document symbols" },
			{ "<leader>sS", "<cmd>Telescope lsp_dynamic_workspace_symbols<cr>", desc = "Workspace symbols" },
			{
				"<leader>sw",
				function()
					require("telescope.builtin").live_grep({
						default_text = vim.fn.expand("<cword>"),
						search_dirs = { vim.fn.expand("%:p") },
					})
				end,
				desc = "For <cword>",
			},
			{
				"<leader>sW",
				function()
					require("telescope.builtin").live_grep({
						default_text = vim.fn.expand("<cWORD>"),
						search_dirs = { vim.fn.expand("%:p") },
					})
				end,
				desc = "For <cWORD>",
			},
		},
	},
}
