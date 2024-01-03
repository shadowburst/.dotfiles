return {
	{
		"williamboman/mason.nvim",
		opts = {
			ensure_installed = {
				"blade-formatter",
				"luacheck",
				"jq",
				"prettier",
				"prettierd",
				"shellcheck",
				"shfmt",
				"stylua",
				"yamlfmt",
			},
		},
	},
}
