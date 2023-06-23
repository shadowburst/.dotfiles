return {
	{
		"akinsho/toggleterm.nvim",
		event = "VeryLazy",
		keys = {
			{
				"²",
				"<cmd>ToggleTerm<cr>",
				desc = "Open terminal",
			},
			{
				"<leader>ot",
				"<cmd>ToggleTerm<cr>",
				desc = "Open terminal",
			},
			{
				"²",
				"<cmd>ToggleTerm<cr>",
				desc = "Close terminal",
				mode = "t",
			},
			{
				"<C-h>",
				[[<C-\><C-n><C-W>h]],
				desc = "Go to left window",
				mode = "t",
			},
			{
				"<C-j>",
				[[<C-\><C-n><C-W>j]],
				desc = "Go to lower window",
				mode = "t",
			},
			{
				"<C-k>",
				[[<C-\><C-n><C-W>k]],
				desc = "Go to upper window",
				mode = "t",
			},
			{
				"<C-l>",
				[[<C-\><C-n><C-W>l]],
				desc = "Go to right window",
				mode = "t",
			},
			{
				"<C-é>",
				"<cmd>2ToggleTerm<cr>",
				desc = "Open a second terminal",
				mode = "t",
			},
		},
		opts = {
			size = 15,
			open_mapping = [[<c-\>]],
			hide_numbers = true,
			shade_filetypes = {},
			shade_terminals = false,
			shading_factor = 2,
			start_in_insert = true,
			insert_mappings = true,
			persist_size = true,
			direction = "horizontal",
			close_on_exit = true,
			shell = vim.o.shell,
			float_opts = {
				border = "curved",
				winblend = 0,
				highlights = {
					border = "Normal",
					background = "Normal",
				},
			},
		},
	},
}
