return {
	{
		"nvim-treesitter/nvim-treesitter",
		dependencies = {
			"nvim-treesitter/nvim-treesitter-context",
			"nvim-treesitter/nvim-treesitter-textobjects",
			"folke/ts-comments.nvim",
		},
		build = ":TSUpdate",
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = {
			auto_install = true,
			ensure_installed = {
				"bash",
				"css",
				"dockerfile",
				"fish",
				"git_config",
				"go",
				"gomod",
				"gosum",
				"gowork",
				"html",
				"hyprlang",
				"javascript",
				"json",
				"lua",
				"markdown",
				"markdown_inline",
				"php",
				"phpdoc",
				"regex",
				"scss",
				"sql",
				"tsx",
				"typescript",
				"vim",
				"vimdoc",
				"vue",
				"yaml",
				"yuck",
			},
			highlight = {
				enable = true,
			},
			indent = {
				enable = true,
			},
		},
		config = function(_, opts)
			require("nvim-treesitter.configs").setup(opts)

			vim.filetype.add({
				pattern = {
					[".*/kitty/.+%.conf"] = "bash",
					[".*/hypr/.+%.conf"] = "hyprlang",
					["%.env%.[%w_.-]+"] = "sh",
				},
			})
		end,
	},
	{
		"windwp/nvim-ts-autotag",
		dependencies = {
			"nvim-treesitter/nvim-treesitter",
		},
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = {
			enable = true,
		},
	},
}
