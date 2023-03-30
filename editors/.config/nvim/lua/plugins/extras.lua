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
				"jk",
				[[<C-\><C-n>]],
				desc = "Exit insert mode",
				mode = "t",
			},
			{
				"kj",
				[[<C-\><C-n>]],
				desc = "Exit insert mode",
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
		},
		config = function()
			require("toggleterm").setup({
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
			})

			local Terminal = require("toggleterm.terminal").Terminal

			local lazygit = Terminal:new({ cmd = "lazygit", hidden = true, direction = "float" })
			local lazydocker = Terminal:new({ cmd = "lazydocker", hidden = true, direction = "float" })

			local map = vim.keymap.set

			map("n", "<leader>od", function()
				lazydocker:toggle()
			end, { desc = "Open Lazydocker", silent = true })

			map("n", "<leader>og", function()
				lazygit:toggle()
			end, { desc = "Open Lazygit", silent = true })
		end,
	},
}
