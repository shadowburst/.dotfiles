return {
	{
		"NeogitOrg/neogit",
		dependencies = {
			"nvim-lua/plenary.nvim",
			"sindrets/diffview.nvim",
		},
		opts = {
			disable_hint = true,
			graph_style = "unicode",
			ignored_settings = {
				"NeogitPushPopup--force-with-lease",
				"NeogitPushPopup--force",
				"NeogitPushPopup--set-upstream",
				"NeogitPullPopup--rebase",
				"NeogitCommitPopup--allow-empty",
				"NeogitRevertPopup--no-edit",
				"NeogitLogPopup--",
			},
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
		keys = {
			{
				"<leader>gg",
				function()
					require("neogit").open({})
				end,
				desc = "Open neogit",
			},
			{
				"<leader>gl",
				function()
					require("neogit").open({ "log" })
				end,
				desc = "Git logs",
			},
		},
	},
}
