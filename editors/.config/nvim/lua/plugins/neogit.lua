return {
	{
		"TimUntersberger/neogit",
		dependencies = {
			"nvim-lua/plenary.nvim",
		},
		keys = {
			{
				"<leader>gg",
				function()
					require("neogit").open()
				end,
				desc = "Open neogit",
			},
		},
		opts = {
			disable_commit_confirmation = true,
			disable_insert_on_commit = false,
			signs = {
				-- { CLOSED, OPENED }
				section = { "", "" },
				item = { "", "" },
				hunk = { "", "" },
			},
		},
	},
}
