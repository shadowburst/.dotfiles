return {
	{
		"folke/which-key.nvim",
		event = "VeryLazy",
		opts = {
			preset = "modern",
			icons = {
				mappings = false,
			},
			spec = {
				{
					mode = { "n", "v" },
					{ "g", group = "goto" },
					{ "ga", group = "Change case" },
					{ "<leader>b", group = "buffers" },
					{ "<leader>c", group = "code" },
					{ "<leader>f", group = "file/find" },
					{ "<leader>g", group = "git" },
					{ "<leader>h", group = "harpoon" },
					{ "<leader>n", group = "notifications" },
					{ "<leader>q", group = "quit" },
					{ "<leader>s", group = "search" },
					{ "<leader>t", group = "toggle" },
					{ "<leader>v", group = "neovim" },
					{ "<leader>w", group = "windows" },
					{ "<leader>x", group = "diagnostics/quickfix" },
				},
			},
		},
	},
}
