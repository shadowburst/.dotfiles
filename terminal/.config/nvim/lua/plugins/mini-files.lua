return {
	{
		"echasnovski/mini.files",
		dependencies = {
			"nvim-tree/nvim-web-devicons",
		},
		opts = {
			mappings = {
				go_in_plus = "l",
			},
			options = {
				permanent_delete = false,
			},
			windows = {
				max_number = 3,
				preview = true,
				width_focus = 60,
				width_nofocus = 30,
				width_preview = 60,
			},
		},
		keys = {
			{
				"<leader>e",
				function()
					require("mini.files").open(vim.api.nvim_buf_get_name(0), true)
				end,
				desc = "Open file explorer",
			},
		},
	},
}
