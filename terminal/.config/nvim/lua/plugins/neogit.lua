return {
	{
		"NeogitOrg/neogit",
		dependencies = {
			"nvim-lua/plenary.nvim",
			"sindrets/diffview.nvim",
		},
		keys = {
			{
				"<leader>gg",
				function()
					require("neogit").open({})
				end,
				desc = "Open neogit",
			},
		},
		opts = {
			disable_commit_confirmation = true,
			disable_insert_on_commit = false,
			remember_settings = false,
			auto_show_console = false,
			commit_editor = {
				kind = "split",
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
	},
}
