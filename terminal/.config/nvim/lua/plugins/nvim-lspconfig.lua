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
					init_options = {
						plugins = {
							{
								name = "@vue/typescript-plugin",
								location = "~/.local/share/nvim/mason/packages/vue-language-server/node_modules/@vue/language-server",
								languages = { "vue" },
							},
						},
					},
				},
				volar = {
					init_options = {
						vue = {
							hybridMode = false,
						},
					},
				},
				yamlls = {},
			},
		},
	},
}
