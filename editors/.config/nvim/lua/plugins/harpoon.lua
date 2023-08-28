return {
	{
		"ThePrimeagen/harpoon",
		keys = {
			{
				"<S-h>",
				function()
					require("harpoon.ui").nav_prev()
				end,
				desc = "Go to previous marked file",
			},
			{
				"<S-l>",
				function()
					require("harpoon.ui").nav_next()
				end,
				desc = "Go to next marked file",
			},
			{
				"<leader>ma",
				function()
					require("harpoon.mark").add_file()
				end,
				desc = "Add current file to harpoon",
			},
			{
				"<leader>mm",
				function()
					require("harpoon.ui").toggle_quick_menu()
				end,
				desc = "Toggle harpoon menu",
			},
			{
				"<leader>mh",
				function()
					require("harpoon.ui").nav_file(1)
				end,
				desc = "Goto file 1",
			},
			{
				"<leader>mj",
				function()
					require("harpoon.ui").nav_file(2)
				end,
				desc = "Goto file 2",
			},
			{
				"<leader>mk",
				function()
					require("harpoon.ui").nav_file(3)
				end,
				desc = "Goto file 3",
			},
			{
				"<leader>ml",
				function()
					require("harpoon.ui").nav_file(4)
				end,
				desc = "Goto file 4",
			},
		},
	},
}
