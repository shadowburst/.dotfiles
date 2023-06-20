return {
	{
		"neovim/nvim-lspconfig",
		opts = {
			servers = {
				bashls = {},
				cssls = {},
				dockerls = {},
				emmet_ls = {},
				html = {},
				intelephense = {},
				jsonls = {},
				lua_ls = {
					root_dir = function()
						return vim.loop.cwd()
					end,
					settings = {
						Lua = {
							workspace = {
								checkThirdParty = false,
							},
							completion = {
								callSnippet = "Replace",
							},
						},
					},
				},
				rnix = {},
				tailwindcss = {
					filetypes_exclude = { "markdown", "php" },
				},
				tsserver = {},
				volar = {},
				yamlls = {},
			},
		},
	},
}
