return {
	{
		"NeogitOrg/neogit",
		dependencies = {
			"sindrets/diffview.nvim",
			"nvim-lua/plenary.nvim",
			"nvim-telescope/telescope.nvim",
		},
		cmd = { "Neogit", "NeogitLogCurrent" },
		---@module 'neogit'
		---@type NeogitConfig
		opts = {
			disable_hint = true,
			graph_style = "kitty",
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
			{ "<leader>gg", "<cmd>Neogit<cr>", desc = "Open neogit" },
			{ "<leader>gl", "<cmd>Neogit log<cr>", desc = "Git logs" },
		},
	},
}
