return {
	{
		"telescope.nvim",
		dependencies = {
			{
				"nvim-telescope/telescope-fzf-native.nvim",
				build = "make",
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
			},
			{
				"nvim-telescope/telescope-project.nvim",
				keys = {
					{
						"<leader>pp",
						"<cmd>Telescope project<cr>",
						desc = "Switch project",
					},
				},
			},
		},
		keys = {
			{
				"<leader><leader>",
				"<cmd>Telescope find_files<cr>",
				desc = "Find files",
			},
			{
				"<leader>cD",
				"<cmd>Telescope diagnostics<cr>",
				desc = "Diagnostics",
			},
			{
				"<leader>hC",
				"<cmd>Telescope command_history<cr>",
				desc = "Command History",
			},
			{
				"<leader>hc",
				"<cmd>Telescope commands<cr>",
				desc = "Commands",
			},
			{
				"<leader>hh",
				"<cmd>Telescope help_tags<cr>",
				desc = "Help Pages",
			},
			{
				"<leader>hk",
				"<cmd>Telescope keymaps<cr>",
				desc = "Key Maps",
			},
			{
				"<leader>hm",
				"<cmd>Telescope man_pages<cr>",
				desc = "Man Pages",
			},
			{
				"<leader>ho",
				"<cmd>Telescope vim_options<cr>",
				desc = "Options",
			},
			{
				"<leader>sG",
				"<cmd>Telescope live_grep grep_open_files=true<cr>",
				desc = "Grep (Open buffers)",
			},
			{
				"<leader>ss",
				"<cmd>Telescope current_buffer_fuzzy_find<cr>",
				desc = "Search in buffer",
			},
			{ "<leader>sa", false },
			{ "<leader>sb", false },
			{ "<leader>sc", false },
			{ "<leader>sC", false },
			{ "<leader>sd", false },
			{ "<leader>sh", false },
			{ "<leader>sH", false },
			{ "<leader>sk", false },
			{ "<leader>sm", false },
			{ "<leader>so", false },
			{ "<leader>sR", false },
			{ "<leader>sS", false },
			{ "<leader>sW", false },
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
						["<Tab>"] = function(...)
							require("telescope.actions").move_selection_worse(...)
						end,
						["<S-Tab>"] = function(...)
							require("telescope.actions").move_selection_better(...)
						end,
						["<C-j>"] = function(...)
							require("telescope.actions").move_selection_worse(...)
						end,
						["<C-k>"] = function(...)
							require("telescope.actions").move_selection_better(...)
						end,
						["<C-d>"] = function(...)
							require("telescope.actions").results_scrolling_down(...)
						end,
						["<C-u>"] = function(...)
							require("telescope.actions").results_scrolling_up(...)
						end,
						["<C-v>"] = function(...)
							require("telescope.actions").toggle_all(...)
						end,
						["<C-space>"] = function(...)
							require("telescope.actions").toggle_selection(...)
						end,
					},
					["n"] = {
						["<Tab>"] = function(...)
							require("telescope.actions").move_selection_worse(...)
						end,
						["<S-Tab>"] = function(...)
							require("telescope.actions").move_selection_better(...)
						end,
						["j"] = function(...)
							require("telescope.actions").move_selection_worse(...)
						end,
						["k"] = function(...)
							require("telescope.actions").move_selection_better(...)
						end,
						["<C-d>"] = function(...)
							require("telescope.actions").results_scrolling_down(...)
						end,
						["<C-u>"] = function(...)
							require("telescope.actions").results_scrolling_up(...)
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
				project = {
					hidden_files = true,
				},
				file_browser = {
					initial_mode = "normal",
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
							["y"] = function(...)
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
		init = function()
			local telescope = require("telescope")

			telescope.load_extension("fzf")
			telescope.load_extension("project")
			telescope.load_extension("file_browser")
		end,
	},
}
