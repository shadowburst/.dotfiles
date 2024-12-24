local mappings = {
	evaluate = "g=",
	multiply = "m",
	replace = "x",
	sort = "gs",
}

return {
	{
		"echasnovski/mini.operators",
		event = { "BufNewFile", "BufReadPost", "BufWritePre" },
		opts = {
			evaluate = { prefix = mappings.evaluate },
			multiply = { prefix = mappings.multiply },
			replace = { prefix = mappings.replace },
			sort = { prefix = mappings.sort },
		},
		keys = {
			{
				"<S-" .. mappings.multiply .. ">",
				function()
					local keys = MiniOperators.multiply() .. vim.api.nvim_replace_termcodes("$", true, true, true)
					vim.api.nvim_feedkeys(keys, "n", false)
				end,
			},
			{
				"<S-" .. mappings.replace .. ">",
				function()
					local keys = MiniOperators.replace() .. vim.api.nvim_replace_termcodes("$", true, true, true)
					vim.api.nvim_feedkeys(keys, "n", false)
				end,
			},
		},
	},
}
