return {
	{
		"nvim-neo-tree/neo-tree.nvim",
		opts = {
			filesystem = {
				bind_to_cwd = true,
				follow_current_file = true,
				group_empty_dirs = true,
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
					["h"] = "close_node",
					["l"] = "open",
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
			},
			pickers = {
				find_files = {
					hidden = true,
				},
				live_grep = {
					additional_args = {
						"--hidden",
					},
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
		"folke/which-key.nvim",
		event = "VeryLazy",
		opts = function()
			require("which-key").register({
				["<leader>o"] = { name = "+open" },
				["<leader>p"] = { name = "+projects" },
			})
		end,
	},
	{ "lambdalisue/suda.vim" },
}
