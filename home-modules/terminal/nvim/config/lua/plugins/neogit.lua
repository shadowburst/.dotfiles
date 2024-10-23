return {
	{
		"NeogitOrg/neogit",
		dependencies = {
			"sindrets/diffview.nvim",
			"nvim-lua/plenary.nvim",
			"nvim-telescope/telescope.nvim",
		},
		cmd = { "Neogit", "NeogitLogCurrent" },
		opts = {
			disable_hint = true,
			graph_style = "unicode",
			remember_settings = false,
			auto_refresh = false,
			commit_editor = {
				kind = "split",
				show_staged_diff = false,
			},
			integrations = {
				telescope = true,
				diffview = true,
			},
			signs = {
				-- { CLOSED, OPENED }
				section = { "", "" },
				item = { "", "" },
				hunk = { "", "" },
			},
		},
		keys = {
			{ "<leader>gb", "<cmd>NeogitLogCurrent<cr>", desc = "Current buffer logs" },
			{ "<leader>gg", "<cmd>Neogit<cr>", desc = "Open neogit" },
			{ "<leader>gl", "<cmd>Neogit log<cr>", desc = "Git logs" },
		},
	},
}
