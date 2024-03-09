return {
	{
		"neovim/nvim-lspconfig",
		opts = {
			inlay_hints = {
				enable = false,
			},
			codelens = {
				enable = false,
			},
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
				rust_analyzer = {
					settings = {
						["rust-analyzer"] = {
							cachePriming = {
								enable = false,
								numThreads = 2,
							},
						},
					},
				},
				tailwindcss = {
					filetypes_exclude = { "markdown", "php" },
				},
				tsserver = {
					filetypes_exclude = { "vue" },
				},
				volar = {
					init_options = {
						typescript = {
							tsdk = "$XDG_DATA_HOME/nvim/mason/bin",
						},
					},
				},
				yamlls = {},
			},
		},
	},
}
