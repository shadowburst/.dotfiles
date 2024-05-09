return {
	{
		"DreamMaoMao/yazi.nvim",
		dependencies = {
			"nvim-telescope/telescope.nvim",
			"nvim-lua/plenary.nvim",
		},
		cmds = { "Yazi" },
		keys = {
			{ "<leader>e", "<cmd>Yazi<CR>", desc = "Open file manager" },
		},
	},
}
