return {
	{
		"echasnovski/mini.align",
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = {
			mappings = {
				start = "gA",
				start_with_preview = "",
			},
		},
	},
}
