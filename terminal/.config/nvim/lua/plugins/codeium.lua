return {
	{
		"Exafunction/codeium.vim",
		event = "BufEnter",
		config = function()
			vim.keymap.del("i", "<Right>")
			vim.keymap.del("i", "<C-Right>")
		end,
	},
}
