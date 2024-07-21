return {
	{
		"echasnovski/mini.indentscope",
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = {
			symbol = "│",
			options = {
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
					"tfm",
				},
				callback = function()
					vim.b.miniindentscope_disable = true
				end,
			})
		end,
	},
}
