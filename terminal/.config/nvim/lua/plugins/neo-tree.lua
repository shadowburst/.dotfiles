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
						dir = require("lazyvim.util").root.get(),
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

			return {
				filesystem = {
					group_empty_dirs = true,
					scan_mode = "deep",
					cwd_target = {
						sidebar = "window",
					},
					filtered_items = {
						visible = true,
						hide_dotfiles = false,
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
