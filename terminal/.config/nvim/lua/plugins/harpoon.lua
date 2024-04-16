return {
	{
		"ThePrimeagen/harpoon",
		branch = "harpoon2",
		opts = {
			menu = {
				width = vim.api.nvim_win_get_width(0) - 4,
			},
			settings = {
				{
					save_on_toggle = true,
					sync_on_ui_close = true,
				},
			},
		},
		keys = {
			{
				"<S-h>",
				function()
					require("harpoon"):list():prev()
				end,
				desc = "Harpoon to previous marked file",
			},
			{
				"<S-l>",
				function()
					require("harpoon"):list():next()
				end,
				desc = "Harpoon to next marked file",
			},
			{
				"<leader>H",
				function()
					require("harpoon"):list():append()
					vim.notify("Harpooned file")
				end,
				desc = "Harpoon file",
			},
			{
				"<leader>hc",
				function()
					local harpoon = require("harpoon")
					if harpoon:list():length() > 0 then
						harpoon:list():clear()
						vim.notify("Harpoon cleared")
					else
						vim.notify("Harpoon already empty")
					end
				end,
				desc = "Clear all marked files",
			},
			{
				"<leader>hm",
				function()
					local harpoon = require("harpoon")
					harpoon.ui:toggle_quick_menu(harpoon:list())
				end,
				desc = "Harpoon menu",
			},
			{
				"<leader>hh",
				function()
					require("harpoon"):list():select(1)
				end,
				desc = "Harpoon to file 1",
			},
			{
				"<leader>hj",
				function()
					require("harpoon"):list():select(2)
				end,
				desc = "Harpoon to file 2",
			},
			{
				"<leader>hk",
				function()
					require("harpoon"):list():select(3)
				end,
				desc = "Harpoon to file 3",
			},
			{
				"<leader>hl",
				function()
					require("harpoon"):list():select(4)
				end,
				desc = "Harpoon to file 4",
			},
		},
	},
}
