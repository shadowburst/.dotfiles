return {
	{
		"lambdalisue/suda.vim",
		lazy = false,
		keys = {
			{
				"<leader>fs",
				"<cmd>SudaRead<cr>",
				desc = "Sudo this file",
			},
			{
				"<leader>fS",
				"<cmd>SudaWrite<cr>",
				desc = "Sudo write this file",
			},
		},
	},
}
