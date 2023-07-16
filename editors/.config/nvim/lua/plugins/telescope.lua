return {
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
			{ "<leader>sR", false },
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
				project = {
					hidden_files = true,
				},
			},
		},
	},
}
