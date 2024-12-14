return {
	{
		"danymat/neogen",
		dependencies = { "garymjr/nvim-snippets" },
		opts = { snippet_engine = "nvim" },
		keys = {
			{ "<leader>cg", "<cmd>Neogen<cr>", desc = "Generate annotations" },
		},
	},
}
