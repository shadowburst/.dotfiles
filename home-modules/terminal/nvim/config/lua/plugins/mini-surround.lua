return {
	{
		"echasnovski/mini.surround",
		opts = {
			mappings = {
				add = "sa",
				delete = "sd",
				replace = "sc",
			},
		},
		keys = {
			{ "sa", mode = { "n", "v" }, desc = "Add surrounding" },
			{ "sd", mode = "n", desc = "Delete surrounding" },
			{ "sc", mode = "n", desc = "Replace surrounding" },
		},
	},
}
