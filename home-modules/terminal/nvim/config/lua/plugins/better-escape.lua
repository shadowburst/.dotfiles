return {
	{
		"max397574/better-escape.nvim",
		event = "InsertEnter",
		opts = {
			default_mappings = false,
			mappings = {
				i = {
					j = { k = "<Esc>" },
					k = { j = "<Esc>" },
				},
				c = {
					j = { k = "<Esc>" },
					k = { j = "<Esc>" },
				},
				t = {
					j = { k = "<C-\\><C-n>" },
					k = { j = "<C-\\><C-n>" },
				},
				v = {
					j = { k = "<Esc>" },
					k = { j = "<Esc>" },
				},
				s = {
					j = { k = "<Esc>" },
					k = { j = "<Esc>" },
				},
			},
		},
	},
}
