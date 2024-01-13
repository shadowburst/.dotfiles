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
				config = function()
					require("lazyvim.util").on_load("telescope.nvim", function()
						require("telescope").load_extension("file_browser")
					end)
				end,
			},
			{
				"nvim-telescope/telescope-fzf-native.nvim",
				build = "make",
				config = function()
					require("lazyvim.util").on_load("telescope.nvim", function()
						require("telescope").load_extension("fzf")
					end)
				end,
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
				config = function()
					require("lazyvim.util").on_load("telescope.nvim", function()
						require("telescope").load_extension("undo")
					end)
				end,
			},
		},
		keys = {
			{
				"<leader><leader>",
				"<cmd>Telescope find_files<cr>",
				desc = "Find files",
			},
			{
				"<leader>fr",
				"<cmd>Telescope oldfiles only_cwd=true<cr>",
				desc = "Recent files",
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
				"<leader>sc",
				"<cmd>Telescope command_history<cr>",
				desc = "Command History",
			},
			{
				"<leader>sG",
				"<cmd>Telescope live_grep grep_open_files=true<cr>",
				desc = "Grep (Open buffers)",
			},
			{
				"<leader>sl",
				"<cmd>Telescope lsp_document_symbols<cr>",
				desc = "Symbols",
			},
			{
				"<leader>ss",
				"<cmd>Telescope current_buffer_fuzzy_find<cr>",
				desc = "Search in buffer",
			},
			{ "<leader>fR", false },
			{ "<leader>sa", false },
			{ "<leader>sb", false },
			{ "<leader>sC", false },
			{ "<leader>sh", false },
			{ "<leader>sH", false },
			{ "<leader>sk", false },
			{ "<leader>sm", false },
			{ "<leader>sM", false },
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
	},
}
