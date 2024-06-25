return {
	{
		"echasnovski/mini.visits",
		event = "VeryLazy",
		opts = {
			silent = true,
			store = {
				autowrite = false,
			},
		},
		keys = {
			{
				"<S-h>",
				function()
					require("mini.visits").iterate_paths("backward", vim.fn.getcwd(), { wrap = true })
				end,
				desc = "Navigate to previous buffer",
			},
			{
				"<S-l>",
				function()
					require("mini.visits").iterate_paths("forward", vim.fn.getcwd(), { wrap = true })
				end,
				desc = "Navigate to next buffer",
			},
		},
	},
}
