return {
	{
		"neovim/nvim-lspconfig",
		opts = {
			servers = {
				bashls = {},
				cssls = {},
				dockerls = {},
				docker_compose_language_service = {},
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
