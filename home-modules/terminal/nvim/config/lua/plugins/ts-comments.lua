return {
	{
		"folke/ts-comments.nvim",
		event = { "BufNewFile", "BufReadPost", "BufWritePre" },
		opts = {
			lang = {
				phpdoc = { "// %s" },
			},
		},
	},
}
