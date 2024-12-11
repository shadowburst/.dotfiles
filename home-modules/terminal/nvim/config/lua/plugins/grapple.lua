return {
	{
		"cbochs/grapple.nvim",
		cmd = { "Grapple" },
		opts = {
			scope = "git",
			win_opts = {
				border = "rounded",
			},
		},
		keys = {
			{ "<C-m>", "<cmd>Grapple toggle<cr>", desc = "Grapple toggle tag" },
			{ "<leader>m", "<cmd>Grapple toggle_tags<cr>", desc = "Grapple tags window" },
			{ "<S-h>", "<cmd>Grapple cycle_tags prev<cr>", desc = "Grapple cycle previous tag" },
			{ "<S-l>", "<cmd>Grapple cycle_tags next<cr>", desc = "Grapple cycle next tag" },
		},
	},
}
