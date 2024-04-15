return {
	{
		"neovim/nvim-lspconfig",
		dependencies = {
			"WhoIsSethDaniel/mason-tool-installer.nvim",
			"williamboman/mason-lspconfig.nvim",
			"williamboman/mason.nvim",
			"folke/neodev.nvim",
			"b0o/SchemaStore.nvim",
		},
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		config = function()
			local signs = { Error = " ", Warn = " ", Hint = "󰌶 ", Info = " " }
			for type, icon in pairs(signs) do
				local hl = "DiagnosticSign" .. type
				vim.fn.sign_define(hl, { text = icon, texthl = hl, numhl = hl })
			end

			vim.api.nvim_create_autocmd("LspAttach", {
				group = vim.api.nvim_create_augroup("custom_lsp_attach", { clear = true }),
				callback = function(event)
					local map = function(keys, func, desc)
						require("utils.keys").map("n", keys, func, { buffer = event.buf, desc = desc })
					end

					map("gd", "<cmd>Telescope lsp_definitions<cr>", "Goto definition")
					map("gi", "<cmd>Telescope lsp_implementations<cr>", "Goto implementation")
					map("gr", "<cmd>Telescope lsp_references<cr>", "Goto references")
					map("K", vim.lsp.buf.hover, "Hover documentation")
					map("<leader>ca", vim.lsp.buf.code_action, "Code action")
					map("<leader>cd", "<cmd>Telescope lsp_type_definitions<cr>", "Type definition")
					map("<leader>cs", "<cmd>Telescope lsp_document_symbols<cr>", "Document symbols")
					map("<leader>cS", "<cmd>Telescope lsp_dynamic_workspace_symbols<cr>", "Workspace symbols")
				end,
			})

			local capabilities = vim.lsp.protocol.make_client_capabilities()
			capabilities = vim.tbl_deep_extend("force", capabilities, require("cmp_nvim_lsp").default_capabilities())

			require("mason").setup()

			local mason_registry = require("mason-registry")
			local vue_language_server_path = mason_registry.get_package("vue-language-server"):get_install_path()
				.. "/node_modules/@vue/language-server"

			local servers = {
				bashls = {},
				cssls = {},
				dockerls = {},
				docker_compose_language_service = {},
				eslint = {
					settings = {
						workingDirectories = { mode = "auto" },
					},
				},
				gopls = {
					settings = {
						gopls = {
							gofumpt = true,
							codelenses = {
								gc_details = false,
								generate = true,
								regenerate_cgo = true,
								run_govulncheck = true,
								test = true,
								tidy = true,
								upgrade_dependency = true,
								vendor = true,
							},
							hints = {
								assignVariableTypes = true,
								compositeLiteralFields = true,
								compositeLiteralTypes = true,
								constantValues = true,
								functionTypeParameters = true,
								parameterNames = true,
								rangeVariableTypes = true,
							},
							analyses = {
								fieldalignment = true,
								nilness = true,
								unusedparams = true,
								unusedwrite = true,
								useany = true,
							},
							usePlaceholders = true,
							completeUnimported = true,
							staticcheck = true,
							directoryFilters = { "-.git", "-.vscode", "-.idea", "-.vscode-test", "-node_modules" },
							semanticTokens = true,
						},
					},
				},
				html = {},
				intelephense = {},
				jsonls = {
					settings = {
						json = {
							schemas = require("schemastore").json.schemas(),
							validate = { enable = true },
						},
					},
				},
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
				tsserver = {
					init_options = {
						plugins = {
							{
								name = "@vue/typescript-plugin",
								location = vue_language_server_path,
								languages = { "vue" },
							},
						},
					},
					filetypes = { "typescript", "javascript", "javascriptreact", "typescriptreact" },
				},
				volar = {
					init_options = {
						vue = {
							hybridMode = false,
						},
					},
				},
				yamlls = {
					settings = {
						yaml = {
							schemaStore = {
								enable = false,
								url = "",
							},
							schemas = require("schemastore").yaml.schemas(),
						},
					},
				},
			}

			local ensure_installed = vim.tbl_keys(servers or {})
			vim.list_extend(ensure_installed, {
				"blade-formatter",
				"eslint_d",
				"gofumpt",
				"goimports",
				"hadolint",
				"jq",
				"luacheck",
				"markdownlint",
				"marksman",
				"prettierd",
				"shellcheck",
				"shfmt",
				"stylua",
				"xmlformatter",
				"yamlfmt",
				"yamllint",
			})
			require("mason-tool-installer").setup({ ensure_installed = ensure_installed })

			require("mason-lspconfig").setup({
				handlers = {
					function(server_name)
						local server = servers[server_name] or {}
						server.capabilities = vim.tbl_deep_extend("force", {}, capabilities, server.capabilities or {})
						require("lspconfig")[server_name].setup(server)
					end,
				},
			})
		end,
	},
	{
		"folke/neodev.nvim",
		opts = {},
	},
}
