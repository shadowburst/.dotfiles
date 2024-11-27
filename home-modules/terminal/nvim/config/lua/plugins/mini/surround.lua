local mappings = {
	add = "sa",
	delete = "sd",
	replace = "sc",
}

return {
	{
		"echasnovski/mini.surround",
		opts = {
			mappings = mappings,
		},
		keys = {
			{ mappings.add, mode = { "n", "v" }, desc = "Add surrounding" },
			{ mappings.delete, mode = "n", desc = "Delete surrounding" },
			{ mappings.replace, mode = "n", desc = "Replace surrounding" },
		},
	},
}
