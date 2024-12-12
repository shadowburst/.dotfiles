return {
	{
		"mbbill/undotree",
		cmd = { "UndotreeToggle" },
		init = function()
			vim.g.undotree_SetFocusWhenToggle = 1
			vim.g.undotree_DiffAutoOpen = 0
			vim.g.undotree_ShortIndicators = 1
		end,
		keys = {
			{ "<leader>u", "<cmd>UndotreeToggle<cr>", desc = "Undotree" },
		},
	},
}
