return {
	{
		"neovim/nvim-lspconfig",
		dependencies = {
			"saghen/blink.cmp",
			"WhoIsSethDaniel/mason-tool-installer.nvim",
			"williamboman/mason-lspconfig.nvim",
			"williamboman/mason.nvim",
			"b0o/SchemaStore.nvim",
			"ibhagwan/fzf-lua",
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
						vim.keymap.set("n", keys, func, { buffer = event.buf, desc = desc })
					end

					map(
						"gd",
						"<cmd>FzfLua lsp_definitions jump_to_single_result=true ignore_current_line=true<cr>",
						"Goto definition"
					)
					map(
						"gr",
						"<cmd>FzfLua lsp_references jump_to_single_result=true ignore_current_line=true<cr>",
						"Goto references"
					)
					map("<leader>ca", vim.lsp.buf.code_action, "Code action")
					map("<leader>cr", vim.lsp.buf.rename, "Rename variable")
				end,
			})

			require("mason").setup()

			local servers = {
				bashls = {},
				cssls = {},
				dockerls = {},
				docker_compose_language_service = {},
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
					settings = {
						Lua = {
							workspace = { checkThirdParty = false },
							completion = { callSnippet = "Replace" },
						},
					},
				},
				marksman = {},
				nil_ls = {},
				tailwindcss = {
					filetypes_exclude = { "markdown", "php" },
				},
				volar = {},
				vtsls = {
					filetypes = {
						"javascript",
						"javascriptreact",
						"javascript.jsx",
						"typescript",
						"typescriptreact",
						"typescript.tsx",
						"vue",
					},
					settings = {
						complete_function_calls = true,
						vtsls = {
							enableMoveToFileCodeAction = true,
							-- autoUseWorkspaceTsdk = true,
							experimental = {
								completion = {
									enableServerSideFuzzyMatch = true,
								},
							},
							tsserver = {
								globalPlugins = {
									{
										name = "@vue/typescript-plugin",
										location = require("mason-registry")
											.get_package("vue-language-server")
											:get_install_path() .. "/node_modules/@vue/language-server",
										languages = { "vue" },
										configNamespace = "typescript",
										enableForWorkspaceTypeScriptVersions = true,
									},
								},
							},
						},
						javascript = {
							suggest = { completeFunctionCalls = true },
						},
						typescript = {
							suggest = { completeFunctionCalls = true },
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
				"hadolint",
				"jq",
				"luacheck",
				"markdownlint-cli2",
				"markdown-toc",
				"prettierd",
				"shellcheck",
				"shfmt",
				"stylua",
				"xmlformatter",
				"yamlfmt",
				"yamllint",
			})

			local capabilities = require("blink.cmp").get_lsp_capabilities()
			require("mason-lspconfig").setup({
				handlers = {
					function(server_name)
						local server = servers[server_name] or {}
						server.capabilities = vim.tbl_deep_extend("force", {}, capabilities, server.capabilities or {})
						require("lspconfig")[server_name].setup(server)
					end,
				},
			})

			require("mason-tool-installer").setup({ ensure_installed = ensure_installed })
		end,
	},
}
