return {
	{
		"nvim-treesitter/nvim-treesitter",
		dependencies = {
			{ "windwp/nvim-ts-autotag" },
		},
		opts = function(_, opts)
			if type(opts.ensure_installed) == "table" then
				vim.list_extend(opts.ensure_installed, {
					"bash",
					"c",
					"cpp",
					"css",
					"dockerfile",
					"fish",
					"html",
					"javascript",
					"json",
					"lua",
					"markdown",
					"markdown_inline",
					"nix",
					"php",
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
				})
			end
			opts.autotag = {
				enable = true,
			}
			opts.indent = {
				enable = true,
				disable = { "yaml" },
			}
		end,
	},
}
