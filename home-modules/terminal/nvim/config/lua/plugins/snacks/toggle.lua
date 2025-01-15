return {
	{
		"folke/snacks.nvim",
		init = function()
			vim.api.nvim_create_autocmd("User", {
				pattern = "VeryLazy",
				callback = function()
					Snacks.toggle.option("spell", { name = "spelling" }):map("<leader>ts")
					Snacks.toggle.option("relativenumber", { name = "relative number" }):map("<leader>tl")
					Snacks.toggle.option("wrap", { name = "wrap" }):map("<leader>tw")
					Snacks.toggle.diagnostics({ name = "diagnostics" }):map("<leader>td")
					Snacks.toggle.zen():map("<leader>z")
				end,
			})
		end,
	},
}
