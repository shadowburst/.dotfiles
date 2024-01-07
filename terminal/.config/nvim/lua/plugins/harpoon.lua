return {
	{
		"ThePrimeagen/harpoon",
		branch = "harpoon2",
		opts = {
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
				desc = "Go to previous marked file",
			},
			{
				"<S-l>",
				function()
					require("harpoon"):list():next()
				end,
				desc = "Go to next marked file",
			},
			{
				"<leader>ma",
				function()
					require("harpoon"):list():append()
				end,
				desc = "Add current file to harpoon",
			},
			{
				"<leader>mc",
				function()
					if require("harpoon"):list():length() > 0 then
						require("harpoon"):list():clear()
						vim.notify("Harpoon cleared")
					else
						vim.notify("Harpoon already empty")
					end
				end,
				desc = "Clear all marked files",
			},
			{
				"<leader>mm",
				function()
					require("harpoon").ui:toggle_quick_menu(require("harpoon"):list())
				end,
				desc = "Toggle harpoon menu",
			},
			{
				"<C-&>",
				function()
					require("harpoon"):list():select(1)
				end,
				desc = "Go to file 1",
			},
			{
				"<leader>mh",
				function()
					require("harpoon"):list():select(1)
				end,
				desc = "Go to file 1",
			},
			{
				"<C-é>",
				function()
					require("harpoon"):list():select(2)
				end,
				desc = "Go to file 2",
			},
			{
				"<leader>mj",
				function()
					require("harpoon"):list():select(2)
				end,
				desc = "Go to file 2",
			},
			{
				'<C-">',
				function()
					require("harpoon"):list():select(3)
				end,
				desc = "Go to file 3",
			},
			{
				"<leader>mk",
				function()
					require("harpoon"):list():select(3)
				end,
				desc = "Go to file 3",
			},
			{
				"<C-'>",
				function()
					require("harpoon"):list():select(4)
				end,
				desc = "Go to file 4",
			},
			{
				"<leader>ml",
				function()
					require("harpoon"):list():select(4)
				end,
				desc = "Go to file 4",
			},
		},
	},
}
