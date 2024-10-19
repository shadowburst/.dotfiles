return {
	{
		"iguanacucumber/magazine.nvim",
		name = "nvim-cmp",
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
		event = { "CmdlineEnter", "InsertEnter" },
		config = function()
			local cmp = require("cmp")
			local mini_icons = require("mini.icons")
			local tailwind_cmp = require("tailwindcss-colorizer-cmp")

			cmp.setup({
				window = {
					completion = {
						border = "rounded",
						winhighlight = "Normal:Pmenu,FloatBorder:FloatBorder,CursorLine:PmenuSel,Search:None",
					},
					documentation = {
						border = "rounded",
						winhighlight = "Normal:Pmenu,FloatBorder:FloatBorder,CursorLine:PmenuSel,Search:None",
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
						return tailwind_cmp.formatter(entry, item)
					end,
				},
				sources = {
					{ name = "nvim_lsp" },
					{ name = "snippets" },
					{ name = "path" },
					{ name = "buffer" },
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
