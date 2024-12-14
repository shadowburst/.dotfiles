return {
	{
		"folke/trouble.nvim",
		dependencies = { "echasnovski/mini.icons" },
		cmd = { "Trouble" },
		opts = {
			auto_close = true,
			auto_preview = true,
			focus = true,
		},
		keys = {
			{ "<leader>xx", "<cmd>Trouble diagnostics toggle filter.buf=0<cr>", desc = "Document diagnostics" },
			{ "<leader>xX", "<cmd>Trouble diagnostics toggle<cr>", desc = "Workspace diagnostics" },
		},
	},
}
