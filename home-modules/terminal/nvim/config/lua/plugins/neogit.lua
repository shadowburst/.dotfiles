return {
	{
		"NeogitOrg/neogit",
		dependencies = {
			"ibhagwan/fzf-lua",
			"nvim-lua/plenary.nvim",
			"sindrets/diffview.nvim",
		},
		cmd = { "Neogit", "NeogitLogCurrent" },
		---@module 'neogit'
		---@type NeogitConfig
		opts = {
			process_spinner = true,
			disable_hint = true,
			graph_style = "kitty",
			remember_settings = false,
			auto_refresh = false,
			commit_editor = {
				kind = "split",
				show_staged_diff = false,
			},
			integrations = {
				fzf_lua = true,
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
