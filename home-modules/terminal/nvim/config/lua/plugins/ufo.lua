return {
	{
		"kevinhwang91/nvim-ufo",
		dependencies = {
			"kevinhwang91/promise-async",
		},
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = {
			provider_selector = function(bufnr, filetype, buftype)
				return { "treesitter", "indent" }
			end,
		},
		keys = {
			{
				"zR",
				function()
					require("ufo").openAllFolds()
				end,
				desc = "Open all folds",
			},
			{
				"zm",
				function()
					require("ufo").closeAllFolds()
				end,
				desc = "Close all folds",
			},
		},
	},
}
