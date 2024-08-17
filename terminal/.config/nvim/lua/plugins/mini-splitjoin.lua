local mapping = "gs"

return {
	{
		"echasnovski/mini.splitjoin",
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = {
			mappings = {
				toggle = mapping,
			},
		},
		keys = {
			{ mapping, desc = "Toggle join" },
		},
	},
}
