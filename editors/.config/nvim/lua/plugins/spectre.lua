return {
	{
		"nvim-pack/nvim-spectre",
		keys = {
			{ "<leader>sr", enabled = false },
			{
				"<leader>sR",
				function()
					require("spectre").open()
				end,
				desc = "Replace in files (Spectre)",
			},
		},
	},
}
