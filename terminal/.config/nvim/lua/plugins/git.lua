return {
	{
		"sindrets/diffview.nvim",
		opts = {
			keymaps = {
				file_panel = {
					{ "n", "q", "<cmd>DiffviewClose<cr>", { desc = "Close Diffview" } },
				},
			},
		},
		keys = {
			{ "<leader>gd", "<cmd>DiffviewOpen -- %:p <cr>", desc = "Diff this buffer" },
			{
				"<leader>gD",
				function()
					require("diffview").open({})
				end,
				desc = "Diff this repository",
			},
		},
	},
	{
		"lewis6991/gitsigns.nvim",
		event = { "BufReadPre", "BufNewFile" },
		opts = {
			current_line_blame = true,
			preview_config = {
				border = "rounded",
				row = 1,
				col = 0,
			},
			on_attach = function(buffer)
				local gs = package.loaded.gitsigns

				local function map(mode, l, r, desc)
					vim.keymap.set(mode, l, r, { buffer = buffer, desc = desc })
				end

				map("n", "]h", gs.next_hunk, "Next hunk")
				map("n", "[h", gs.prev_hunk, "Prev hunk")
				map("n", "<leader>gp", gs.preview_hunk, "Preview hunk")
				map({ "n", "v" }, "<leader>gr", ":Gitsigns reset_hunk<CR>", "Reset hunk")
			end,
			signs = {
				add = { text = "▎" },
				change = { text = "▎" },
				delete = { text = "" },
				topdelete = { text = "" },
				changedelete = { text = "▎" },
				untracked = { text = "▎" },
			},
		},
	},
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
