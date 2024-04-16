return {
	{
		"lukas-reineke/indent-blankline.nvim",
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = {
			indent = {
				char = "│",
				tab_char = "│",
			},
			scope = {
				enabled = false,
			},
			exclude = {
				filetypes = {
					"help",
					"dashboard",
					"Trouble",
					"trouble",
					"lazy",
					"mason",
					"notify",
				},
			},
		},
		main = "ibl",
	},
}
