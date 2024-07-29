return {
	{
		"hrsh7th/nvim-cmp",
		dependencies = {
			"hrsh7th/cmp-cmdline",
			"hrsh7th/cmp-nvim-lsp",
			"hrsh7th/cmp-path",
			"echasnovski/mini.icons",
			"garymjr/nvim-snippets",
			{
				"roobert/tailwindcss-colorizer-cmp.nvim",
				opts = {},
			},
		},
		event = "VeryLazy",
		config = function()
			local cmp = require("cmp")
			local mini_icons = require("mini.icons")

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
						vim.snippet.expand(args.body)
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
						if vim.snippet.active({ direction = 1 }) then
							vim.schedule(function()
								vim.snippet.jump(1)
							end)
						end
					end, { "i", "s" }),
					["<C-j>"] = cmp.mapping(function()
						if vim.snippet.active({ direction = -1 }) then
							vim.schedule(function()
								vim.snippet.jump(-1)
							end)
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
					{ name = "snippets" },
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
