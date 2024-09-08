local mapping = "gS"

return {
	{
		"echasnovski/mini.splitjoin",
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = {
			mappings = {
				toggle = mapping,
			},
		},
	},
}
