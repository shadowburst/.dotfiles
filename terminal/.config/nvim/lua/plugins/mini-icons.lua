return {
	{
		"echasnovski/mini.icons",
		lazy = false,
		opts = {},
		config = function(_, opts)
			local icons = require("mini.icons")
			icons.setup(opts)
			icons.mock_nvim_web_devicons()
		end,
	},
}
