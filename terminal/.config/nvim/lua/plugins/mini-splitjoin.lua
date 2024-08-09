local mapping = "gs"

return {
	{
		"echasnovski/mini.splitjoin",
		event = "VeryLazy",
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
