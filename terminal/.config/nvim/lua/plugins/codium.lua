return {
	{
		"Exafunction/codeium.vim",
		event = "BufEnter",
		keys = {
			{
				"<TAB>",
				mode = "i",
				function()
					vim.fn["codeium#Accept"]()
				end,
				desc = "Accept codeium suggestion",
			},
		},
	},
}
