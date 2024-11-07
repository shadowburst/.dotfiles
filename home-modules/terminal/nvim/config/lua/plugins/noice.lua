return {
	{
		"folke/noice.nvim",
		dependencies = {
			"echasnovski/mini.icons",
			"MunifTanjim/nui.nvim",
			"folke/snacks.nvim",
			{
				"stevearc/dressing.nvim",
				opts = {},
			},
		},
		event = "VeryLazy",
		cmd = { "Noice" },
		opts = {
			presets = {
				bottom_search = false, -- use a classic bottom cmdline for search
				command_palette = true, -- position the cmdline and popupmenu together
				long_message_to_split = true, -- long messages will be sent to a split
				inc_rename = true, -- enables an input dialog for inc-rename.nvim
				lsp_doc_border = true, -- add a border to hover docs and signature help
			},
			lsp = {
				hover = {
					view = "hover",
				},
				signature = {
					enabled = false,
				},
			},
			views = {
				hover = {
					border = {
						style = "rounded",
						padding = { 0, 1 },
					},
					position = {
						row = 2,
						col = 2,
					},
				},
			},
		},
		keys = {
			{ "<leader>nl", "<cmd>Noice last<cr>", desc = "Last message" },
			{ "<leader>nh", "<cmd>Noice history<cr>", desc = "Message history" },
			{ "<leader>nn", "<cmd>Noice all<cr>", desc = "All messages" },
			{ "<leader>nd", "<cmd>Noice dismiss<cr>", desc = "Dismiss all" },
		},
	},
}
