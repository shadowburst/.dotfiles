return {
	{
		"sindrets/diffview.nvim",
		---@module 'diffview'
		---@type DiffviewConfig
		opts = {
			keymaps = {
				file_panel = {
					{ "n", "q", "<cmd>DiffviewClose<cr>", { desc = "Close Diffview" } },
				},
				file_history_panel = {
					{ "n", "q", "<cmd>DiffviewClose<cr>", { desc = "Close Diffview" } },
				},
			},
		},
		keys = {
			{ "<leader>gd", "<cmd>DiffviewOpen -- %:p <cr>", desc = "Diff this buffer" },
			{ "<leader>gD", "<cmd>DiffviewOpen<cr>", desc = "Diff this repository" },
			{ "<leader>gf", "<cmd>DiffviewFileHistory %<cr>", desc = "File history" },
		},
	},
}
