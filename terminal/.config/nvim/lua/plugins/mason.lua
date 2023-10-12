return {
	{
		"williamboman/mason.nvim",
		opts = {
			ensure_installed = {
				"blade-formatter",
				"luacheck",
				"jq",
				"prettierd",
				"shellcheck",
				"shfmt",
				"stylua",
				"yamlfmt",
			},
		},
	},
}
