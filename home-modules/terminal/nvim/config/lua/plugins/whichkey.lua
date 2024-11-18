return {
	{
		"folke/which-key.nvim",
		event = "VeryLazy",
		---@module 'which-key'
		---@type wk.Config
		opts = {
			preset = "helix",
			icons = {
				mappings = true,
				rules = {
					{ plugin = "undotree", icon = "", color = "blue" },
					{ pattern = "[neo]vim", icon = "", color = "green" },
				},
			},
			defaults = {},
			spec = {
				{
					mode = { "n", "v" },
					{ "[", group = "prev" },
					{ "]", group = "next" },
					{ "z", group = "fold" },
					{ "<leader>b", group = "buffer" },
					{ "<leader>c", group = "code" },
					{ "<leader>f", group = "file/find" },
					{ "<leader>g", group = "git" },
					{ "<leader>n", group = "notifications" },
					{ "<leader>q", group = "quit" },
					{ "<leader>s", group = "search" },
					{ "<leader>t", group = "toggle" },
					{ "<leader>v", group = "neovim" },
					{ "<leader>w", group = "windows", proxy = "<c-w>" },
					{ "<leader>x", group = "diagnostics/quickfix" },
				},
			},
			triggers = {
				{ "<auto>", mode = "nixsotc" },
				{ "s", mode = { "n", "v" } },
			},
		},
	},
}
