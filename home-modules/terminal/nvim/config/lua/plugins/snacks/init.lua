return {
	{
		"folke/snacks.nvim",
		lazy = false,
		priority = 1000,
		---@module 'snacks'
		---@type snacks.Config
		opts = {
			bigfile = {},
			bufdelete = {},
			gitbrowse = {},
			input = {},
			quickfile = {},
			statuscolumn = {},
			words = {},
		},
		init = function()
			vim.api.nvim_create_autocmd("User", {
				pattern = "VeryLazy",
				callback = function()
					Snacks.util.on_key("<esc>", function()
						vim.cmd("noh")
						if vim.snippet then
							vim.snippet.stop()
						end
					end)
				end,
			})
		end,
	},
}
