return {
	{
		"nvim-neo-tree/neo-tree.nvim",
		dependencies = {
			"folke/tokyonight.nvim",
		},
		keys = {
			{ "<leader>E", false },
			{
				"<leader>e",
				function()
					require("neo-tree.command").execute({
						toggle = true,
						dir = require("lazyvim.util").get_root(),
						reveal = true,
					})
				end,
				desc = "Toggle NeoTree",
			},
		},
		opts = function()
			local theme = require("tokyonight.colors").moon()

			vim.api.nvim_set_hl(0, "NeoTreeGitUntracked", { italic = true, fg = theme.green })
			vim.api.nvim_set_hl(0, "NeoTreeGitModified", { italic = true, fg = theme.orange })
			vim.api.nvim_set_hl(0, "NeoTreeNormal", { bg = theme.bg })
			vim.api.nvim_set_hl(0, "NeoTreeNormalNC", { bg = theme.bg })

			return {
				filesystem = {
					bind_to_cwd = true,
					follow_current_file = {
						enabled = true,
					},
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
					position = "current",
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
							require("neo-tree.sources.manager").close_all()
						end,
					},
				},
			}
		end,
	},
}
