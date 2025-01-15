return {
	{
		"folke/snacks.nvim",
		---@module 'snacks'
		---@type snacks.Config
		opts = {
			scope = {
				cursor = false,
				treesitter = { enabled = false },
				linewise = true,
			},
		},
	},
}
