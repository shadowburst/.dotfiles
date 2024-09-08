local mapping = "gA"

return {
	{
		"echasnovski/mini.align",
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = {
			mappings = {
				start = mapping,
				start_with_preview = "",
			},
		},
	},
}
