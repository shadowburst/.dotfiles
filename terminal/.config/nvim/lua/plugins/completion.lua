return {
	{
		"Exafunction/codeium.vim",
		event = "BufEnter",
	},
	{
		"rafamadriz/friendly-snippets",
		config = function()
			require("luasnip.loaders.from_vscode").lazy_load()
		end,
	},
	{
		"L3MON4D3/LuaSnip",
		dependencies = {
			"rafamadriz/friendly-snippets",
		},
		build = (function()
			if vim.fn.has("win32") == 1 or vim.fn.executable("make") == 0 then
				return
			end
			return "make install_jsregexp"
		end)(),
	},
	{
		"danymat/neogen",
		dependencies = {
			"L3MON4D3/LuaSnip",
		},
		opts = {
			snippet_engine = "luasnip",
		},
		keys = {
			{ "<leader>cg", "<cmd>Neogen<cr>", desc = "Generate annotations" },
		},
	},
	{
		"hrsh7th/nvim-cmp",
		dependencies = {
			"saadparwaiz1/cmp_luasnip",
			"hrsh7th/cmp-nvim-lsp",
			"hrsh7th/cmp-path",
			"hrsh7th/cmp-cmdline",
			"onsails/lspkind.nvim",
			"L3MON4D3/LuaSnip",
			"roobert/tailwindcss-colorizer-cmp.nvim",
		},
		event = "InsertEnter",
		config = function()
			local luasnip = require("luasnip")
			local cmp = require("cmp")
			luasnip.config.setup({})

			cmp.setup({
				window = {
					completion = {
						border = "rounded",
						winhighlight = "Normal:Pmenu",
					},
					documentation = {
						border = "rounded",
						winhighlight = "Normal:Pmenu",
					},
				},
				snippet = {
					expand = function(args)
						luasnip.lsp_expand(args.body)
					end,
				},
				completion = {
					completeopt = table.concat(vim.opt.completeopt:get(), ","),
				},
				mapping = cmp.mapping.preset.insert({
					["<C-n>"] = cmp.mapping.select_next_item(),
					["<C-p>"] = cmp.mapping.select_prev_item(),
					["<C-y>"] = cmp.mapping.confirm({ select = true }),
					["<C-Space>"] = cmp.mapping.complete({}),
					["<C-l>"] = cmp.mapping(function()
						if luasnip.expand_or_locally_jumpable() then
							luasnip.expand_or_jump()
						end
					end, { "i", "s" }),
					["<C-h>"] = cmp.mapping(function()
						if luasnip.locally_jumpable(-1) then
							luasnip.jump(-1)
						end
					end, { "i", "s" }),
				}),
				formatting = {
					expandable_indicator = true,
					fields = { "abbr", "kind", "menu" },
					format = function(entry, item)
						local format_kinds = require("lspkind").cmp_format()
						format_kinds(entry, item)
						return require("tailwindcss-colorizer-cmp").formatter(entry, item)
					end,
				},
				sources = {
					{ name = "nvim_lsp" },
					{ name = "luasnip" },
					{ name = "path" },
				},
			})

			cmp.setup.cmdline({ "/", "?" }, {
				mapping = cmp.mapping.preset.cmdline(),
				sources = {
					{ name = "buffer" },
				},
			})

			cmp.setup.cmdline(":", {
				mapping = cmp.mapping.preset.cmdline(),
				sources = cmp.config.sources({
					{ name = "path" },
				}, {
					{
						name = "cmdline",
					},
				}),
			})
		end,
	},
	{
		"roobert/tailwindcss-colorizer-cmp.nvim",
		opts = {},
	},
}
