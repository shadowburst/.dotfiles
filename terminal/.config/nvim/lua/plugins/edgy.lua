return {
	{
		"folke/edgy.nvim",
		event = "VeryLazy",
		opts = {
			bottom = {
				{
					ft = "noice",
					filter = function(buf, win)
						return vim.api.nvim_win_get_config(win).relative == ""
					end,
				},
				"Trouble",
				{ ft = "qf", title = "QuickFix" },
			},
			right = {
				{ ft = "help" },
			},
			options = {
				bottom = { size = 0.5 },
				right = { size = 0.5 },
			},
		},
	},
	{
		"nvim-telescope/telescope.nvim",
		optional = true,
		opts = {
			defaults = {
				get_selection_window = function()
					require("edgy").goto_main()
					return 0
				end,
			},
		},
	},
}
