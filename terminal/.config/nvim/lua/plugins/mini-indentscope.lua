return {
	{
		"echasnovski/mini.indentscope",
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = {
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
					"oil_preview",
				},
				callback = function()
					vim.b.miniindentscope_disable = true
				end,
			})
		end,
	},
}
