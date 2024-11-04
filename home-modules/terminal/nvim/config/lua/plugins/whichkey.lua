return {
	{
		"folke/which-key.nvim",
		event = "VeryLazy",
		opts = {
			preset = "helix",
			icons = {
				mappings = false,
			},
			defaults = {},
			spec = {
				{
					mode = { "n", "v" },
					{ "[", group = "prev" },
					{ "]", group = "next" },
					{ "g", group = "goto" },
					{ "z", group = "fold" },
					{
						"<leader>b",
						group = "buffer",
						expand = function()
							return require("which-key.extras").expand.buf()
						end,
					},
					{ "<leader>c", group = "code" },
					{ "<leader>f", group = "file/find" },
					{ "<leader>g", group = "git" },
					{ "<leader>n", group = "notifications" },
					{ "<leader>q", group = "quit" },
					{ "<leader>s", group = "search" },
					{ "<leader>t", group = "toggle" },
					{ "<leader>v", group = "neovim" },
					{
						"<leader>w",
						group = "windows",
						proxy = "<c-w>",
						expand = function()
							return require("which-key.extras").expand.win()
						end,
					},
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
