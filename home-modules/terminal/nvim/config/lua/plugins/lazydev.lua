return {
	{
		"folke/lazydev.nvim",
		ft = { "lua" },
		---@module 'lazydev'
		---@type lazydev.Config
		opts = {
			library = {
				{ path = "snacks.nvim", words = { "Snacks" } },
			},
		},
	},
}
