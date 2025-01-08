return {
	{
		"echasnovski/mini.icons",
		lazy = false,
		opts = {},
		init = function()
			require("mini.icons").mock_nvim_web_devicons()
		end,
	},
}
