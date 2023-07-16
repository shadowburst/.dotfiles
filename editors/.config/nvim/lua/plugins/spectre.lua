return {
	{
		"nvim-pack/nvim-spectre",
		keys = {
			{
				"<leader>sr",
				function()
					require("spectre").open_file_search({ select_word = true })
				end,
				desc = "Replace in current file",
			},
			{
				"<leader>sR",
				function()
					require("spectre").open_visual({ select_word = true })
				end,
				desc = "Replace in files",
			},
		},
	},
}
