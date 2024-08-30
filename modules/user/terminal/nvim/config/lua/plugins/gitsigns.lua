return {
	{
		"lewis6991/gitsigns.nvim",
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = {
			current_line_blame = true,
			preview_config = {
				border = "rounded",
				row = 1,
				col = 0,
			},
			on_attach = function(buffer)
				local gs = require("gitsigns")

				local function map(mode, l, r, desc)
					vim.keymap.set(mode, l, r, { buffer = buffer, desc = desc })
				end

				map("n", "[h", function()
					gs.nav_hunk("prev")
				end, "Previous hunk")
				map("n", "]h", function()
					gs.nav_hunk("next")
				end, "Next hunk")
				map("n", "<leader>gp", gs.preview_hunk, "Preview hunk")
				map({ "n", "v" }, "<leader>gr", gs.reset_hunk, "Reset hunk")
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
}
