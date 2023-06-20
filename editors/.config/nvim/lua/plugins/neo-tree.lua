return {
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
}
