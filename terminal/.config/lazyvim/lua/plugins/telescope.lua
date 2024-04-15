return {
	{
		"telescope.nvim",
		dependencies = {
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
		},
		config = function(_, opts)
			local telescope = require("telescope")

			telescope.setup(opts)
			telescope.load_extension("fzf")
			telescope.load_extension("undo")
		end,
		keys = {
			{ "<leader><leader>", "<cmd>Telescope find_files<cr>", desc = "Find files" },
			{
				"<leader>.",
				function()
					require("telescope.builtin").find_files({ cwd = require("telescope.utils").buffer_dir() })
				end,
				desc = "Find files",
			},
			{ "<leader>fr", "<cmd>Telescope oldfiles only_cwd=true<cr>", desc = "Recent files" },
			{ "<leader>gc", "<cmd>Telescope git_commits<cr>", desc = "Commits" },
			{ "<leader>gf", "<cmd>Telescope git_bcommits<cr>", desc = "File history" },
			{ "<leader>gs", "<cmd>Telescope git_status<cr>", desc = "Status" },
			{ "<leader>sG", "<cmd>Telescope live_grep grep_open_files=true<cr>", desc = "Grep (Open buffers)" },
			{ "<leader>fR", false },
			{ "<leader>sa", false },
			{ "<leader>sR", false },
			{ "<leader>sW", false },
		},
	},
}
