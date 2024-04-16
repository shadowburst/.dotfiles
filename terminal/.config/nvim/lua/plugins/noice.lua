return {
	{
		"folke/noice.nvim",
		dependencies = {
			"smjonas/inc-rename.nvim",
			"MunifTanjim/nui.nvim",
			"rcarriga/nvim-notify",
			{
				"stevearc/dressing.nvim",
				opts = {},
			},
		},
		event = "VeryLazy",
		opts = {
			presets = {
				bottom_search = true, -- use a classic bottom cmdline for search
				command_palette = true, -- position the cmdline and popupmenu together
				long_message_to_split = true, -- long messages will be sent to a split
				inc_rename = true, -- enables an input dialog for inc-rename.nvim
				lsp_doc_border = true, -- add a border to hover docs and signature help
			},
			lsp = {
				hover = {
					view = "hover",
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
			{
				"<leader>nl",
				function()
					require("noice").cmd("last")
				end,
				desc = "Noice last message",
			},
			{
				"<leader>nh",
				function()
					require("noice").cmd("history")
				end,
				desc = "Noice history",
			},
			{
				"<leader>na",
				function()
					require("noice").cmd("all")
				end,
				desc = "Noice all",
			},
			{
				"<leader>nd",
				function()
					require("noice").cmd("dismiss")
				end,
				desc = "Dismiss all",
			},
		},
	},
}
