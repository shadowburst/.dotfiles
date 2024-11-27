return {
	{
		"echasnovski/mini.indentscope",
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = {
			draw = {
				animation = require("mini.indentscope").gen_animation.none(),
			},
			symbol = "│",
			options = {
				indent_at_cursor = false,
				try_as_border = true,
			},
		},
		init = function()
			vim.api.nvim_create_autocmd("FileType", {
				pattern = {
					"help",
					"dashboard",
					"trouble",
					"lazy",
					"mason",
					"notify",
					"snacks_dashboard",
					"tfm",
				},
				callback = function()
					vim.b.miniindentscope_disable = true
				end,
			})
		end,
	},
}
