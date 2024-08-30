return {
	{
		"Rolv-Apneseth/tfm.nvim",
		lazy = false,
		opts = {
			replace_netrw = true,
			keybindings = {
				["<esc><esc>"] = "<esc>",
				["<C-v>"] = "<C-\\><C-O>:lua require('tfm').set_next_open_mode(require('tfm').OPEN_MODE.vsplit)<CR>l",
				["<C-x>"] = "<C-\\><C-O>:lua require('tfm').set_next_open_mode(require('tfm').OPEN_MODE.split)<CR>l",
				["<C-t>"] = "<C-\\><C-O>:lua require('tfm').set_next_open_mode(require('tfm').OPEN_MODE.tabedit)<CR>l",
			},
			ui = {
				border = "none",
			},
		},
		keys = {
			{
				"<leader>e",
				function()
					require("tfm").open(vim.fn.expand("%"))
				end,
				desc = "File manager",
			},
		},
	},
}
