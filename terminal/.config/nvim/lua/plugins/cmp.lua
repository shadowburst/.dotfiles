return {
	{
		"hrsh7th/nvim-cmp",
		dependencies = {
			"hrsh7th/cmp-cmdline",
			"saadparwaiz1/cmp_luasnip",
			"hrsh7th/cmp-nvim-lsp",
			"hrsh7th/cmp-path",
			"L3MON4D3/LuaSnip",
			"echasnovski/mini.icons",
			{
				"roobert/tailwindcss-colorizer-cmp.nvim",
				opts = {},
			},
		},
		event = "VeryLazy",
		config = function()
			local luasnip = require("luasnip")
			local cmp = require("cmp")
			local mini_icons = require("mini.icons")
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
					["<C-u>"] = cmp.mapping.scroll_docs(-4),
					["<C-d>"] = cmp.mapping.scroll_docs(4),
					["<C-n>"] = cmp.mapping(function()
						if cmp.visible() then
							cmp.select_next_item({})
						else
							cmp.complete({})
						end
					end),
					["<C-p>"] = cmp.mapping.select_prev_item(),
					["<C-y>"] = cmp.mapping.confirm({ select = true }),
					["<C-k>"] = cmp.mapping(function()
						if luasnip.expand_or_locally_jumpable() then
							luasnip.expand_or_jump()
						end
					end, { "i", "s" }),
					["<C-j>"] = cmp.mapping(function()
						if luasnip.locally_jumpable(-1) then
							luasnip.jump(-1)
						end
					end, { "i", "s" }),
				}),
				formatting = {
					expandable_indicator = true,
					fields = { "abbr", "kind", "menu" },
					format = function(entry, item)
						local icon, _, _ = mini_icons.get("lsp", item.kind)
						if icon then
							item.kind = icon .. " " .. item.kind
						end
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
}
