return {
	{
		"folke/edgy.nvim",
		event = { "VeryLazy" },
		opts = {
			bottom = {
				{
					ft = "noice",
					filter = function(buf, win)
						return vim.api.nvim_win_get_config(win).relative == ""
					end,
				},
				{
					ft = "trouble",
					filter = function(buf, win)
						return vim.w[win].trouble
							and vim.w[win].trouble.type == "split"
							and vim.w[win].trouble.relative == "editor"
							and not vim.w[win].trouble_preview
					end,
				},
				{ ft = "qf", title = "QuickFix" },
			},
			left = {
				{ ft = "undotree" },
			},
			right = {
				{ ft = "help" },
				{ ft = "grug-far" },
			},
			animate = { enabled = false },
			options = {
				bottom = { size = 0.3 },
				right = { size = 0.5 },
			},
		},
	},
}
