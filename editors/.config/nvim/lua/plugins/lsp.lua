return {
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
		"jose-elias-alvarez/null-ls.nvim",
		event = { "BufReadPre", "BufNewFile" },
		dependencies = { "mason.nvim" },
		opts = function()
			local nls = require("null-ls")
			return {
				root_dir = require("null-ls.utils").root_pattern(".null-ls-root", ".neoconf.json", "Makefile", ".git"),
				sources = {
					nls.builtins.formatting.prettier,
					nls.builtins.formatting.stylua,
					nls.builtins.formatting.shfmt,
				},
			}
		end,
	},
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
		"hrsh7th/nvim-cmp",
		---@param opts cmp.ConfigSchema
		opts = function(_, opts)
			local has_words_before = function()
				unpack = unpack or table.unpack
				local line, col = unpack(vim.api.nvim_win_get_cursor(0))
				return col ~= 0
					and vim.api.nvim_buf_get_lines(0, line - 1, line, true)[1]:sub(col, col):match("%s") == nil
			end

			local luasnip = require("luasnip")
			local cmp = require("cmp")

			opts.mapping = vim.tbl_extend("force", opts.mapping, {
				["<Tab>"] = cmp.mapping(function(fallback)
					if cmp.visible() then
						cmp.select_next_item()
						-- You could replace the expand_or_jumpable() calls with expand_or_locally_jumpable()
						-- they way you will only jump inside the snippet region
					elseif luasnip.expand_or_jumpable() then
						luasnip.expand_or_jump()
					elseif has_words_before() then
						cmp.complete()
					else
						fallback()
					end
				end, { "i", "s" }),
				["<S-Tab>"] = cmp.mapping(function(fallback)
					if cmp.visible() then
						cmp.select_prev_item()
					elseif luasnip.jumpable(-1) then
						luasnip.jump(-1)
					else
						fallback()
					end
				end, { "i", "s" }),
			})
		end,
	},
}
