return {
	{
		"williamboman/mason.nvim",
		opts = {
			ensure_installed = {
				"blade-formatter",
				"luacheck",
				"jq",
				"prettier",
				"shellcheck",
				"shfmt",
				"stylua",
				"yamlfmt",
			},
		},
	},
	{
		"jose-elias-alvarez/null-ls.nvim",
		event = { "BufReadPre", "BufNewFile" },
		dependencies = { "mason.nvim" },
		opts = function()
			local nls = require("null-ls")
			return {
				root_dir = require("null-ls.utils").root_pattern(".null-ls-root", ".neoconf.json", "Makefile", ".git"),
				sources = {
					nls.builtins.formatting.prettier,
					nls.builtins.formatting.shfmt,
					nls.builtins.formatting.stylua,
				},
			}
		end,
	},
	{
		"neovim/nvim-lspconfig",
		opts = {
			servers = {
				bashls = {},
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
				tailwindcss = {},
				tsserver = {},
				volar = {},
				yamlls = {},
			},
		},
	},
	{
		"nvim-treesitter/nvim-treesitter",
		dependencies = {
			{ "windwp/nvim-ts-autotag" },
			{ "p00f/nvim-ts-rainbow" },
		},
		opts = {
			ensure_installed = {
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
				"php",
				"regex",
				"scss",
				"sql",
				"typescript",
				"vim",
				"vue",
				"yaml",
			},
			autotag = {
				enable = true,
			},
			indent = { enable = true, disable = { "yaml" } },
			rainbow = {
				enable = true,
				extended_mode = false,
			},
		},
	},
	{ "elkowar/yuck.vim" },
}
