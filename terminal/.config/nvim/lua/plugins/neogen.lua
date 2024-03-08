return {
	{
		"danymat/neogen",
		dependencies = {
			"L3MON4D3/LuaSnip",
		},
		opts = {
			snippet_engine = "luasnip",
		},
		keys = {
			{ "<leader>cg", "<cmd>Neogen<cr>", desc = "Generate annotations" },
		},
	},
}
