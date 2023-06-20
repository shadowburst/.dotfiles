return {
	{
		"kalvinpearce/gitignore-gen.nvim",
		event = "VeryLazy",
		dependencies = {
			"nvim-lua/plenary.nvim",
		},
		keys = {
			{
				"<leader>gi",
				"<cmd>GitignoreGenerate<cr>",
				desc = "Generate gitignore",
			},
		},
	},
}
