return {
	{
		"telescope.nvim",
		dependencies = {
			{
				"nvim-telescope/telescope-file-browser.nvim",
				keys = {
					{
						"<leader>.",
						"<cmd>Telescope file_browser initial_mode=insert path=%:p:h=%:p:h<cr>",
						desc = "Browse files",
					},
					{
						"<leader>e",
						"<cmd>Telescope file_browser initial_mode=normal path=%:p:h=%:p:h<cr>",
						desc = "Browse files",
					},
				},
			},
			{
				"nvim-telescope/telescope-fzf-native.nvim",
				build = "make",
				enabled = vim.fn.executable("make") == 1,
			},
			{
				"debugloop/telescope-undo.nvim",
				keys = {
					{
						"<leader>su",
						"<cmd>Telescope undo<cr>",
						desc = "Search undos",
					},
				},
			},
		},
		opts = {
			defaults = {
				file_ignore_patterns = {
					"^.git/*",
					"^.vim/*",
					"^.idea/*",
					"^.vscode/*",
					"^.history/*",
					"^node_modules/*",
					"^vendor/*",
				},
				layout_config = { prompt_position = "top" },
				sorting_strategy = "ascending",
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
						["j"] = function(...)
							require("telescope.actions").move_selection_worse(...)
						end,
						["k"] = function(...)
							require("telescope.actions").move_selection_better(...)
						end,
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
			},
			extensions = {
				file_browser = {
					grouped = true,
					hidden = true,
					hijack_netrw = true,
					respect_gitignore = false,
					select_buffer = true,
					quiet = true,
					mappings = {
						["i"] = {
							["<S-CR>"] = function(...)
								require("telescope._extensions.file_browser.actions").create_from_prompt(...)
							end,
						},
						["n"] = {
							["a"] = function(...)
								require("telescope._extensions.file_browser.actions").create(...)
							end,
							["r"] = function(...)
								require("telescope._extensions.file_browser.actions").rename(...)
							end,
							["m"] = function(...)
								require("telescope._extensions.file_browser.actions").move(...)
							end,
							["p"] = function(...)
								require("telescope._extensions.file_browser.actions").copy(...)
							end,
							["d"] = function(...)
								require("telescope._extensions.file_browser.actions").remove(...)
							end,
							["h"] = function(...)
								require("telescope._extensions.file_browser.actions").goto_parent_dir(...)
							end,
							["l"] = function(...)
								require("telescope.actions").select_default(...)
							end,
							["v"] = function(...)
								require("telescope._extensions.file_browser.actions").toggle_all(...)
							end,
						},
					},
				},
			},
		},
		config = function(_, opts)
			local telescope = require("telescope")

			telescope.setup(opts)
			telescope.load_extension("file_browser")
			telescope.load_extension("fzf")
			telescope.load_extension("undo")
		end,
		keys = {
			{ "<leader><leader>", "<cmd>Telescope find_files<cr>", desc = "Find files" },
			{ "<leader>fr", "<cmd>Telescope oldfiles only_cwd=true<cr>", desc = "Recent files" },
			{ "<leader>gs", desc = "Status" },
			{ "<leader>gf", "<cmd>Telescope git_bcommits<cr>", desc = "File history" },
			{ "<leader>sG", "<cmd>Telescope live_grep grep_open_files=true<cr>", desc = "Grep (Open buffers)" },
			{ "<leader>fR", false },
			{ "<leader>sa", false },
			{ "<leader>sR", false },
			{ "<leader>sW", false },
		},
	},
}
