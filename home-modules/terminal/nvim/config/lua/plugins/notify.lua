return {
	{
		"rcarriga/nvim-notify",
		opts = {
			stages = "static",
			max_width = function()
				return math.floor(vim.o.columns * 0.5)
			end,
		},
		init = function()
			vim.notify = require("notify")
		end,
	},
}
