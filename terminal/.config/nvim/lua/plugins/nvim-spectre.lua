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
		opts = {
			open_cmd = "tabnew",
			highlight = {
				search = "DiffDelete",
				replace = "DiffAdd",
			},
			default = {
				find = {
					options = { "hidden" },
				},
			},
			mapping = {
				["run_current_replace"] = {
					map = "<leader>r",
					cmd = "<cmd>lua require('spectre.actions').run_current_replace()<CR>",
					desc = "replace current line",
				},
			},
		},
	},
}
