return {
	{
		"ThePrimeagen/harpoon",
		keys = {
			{
				"<leader>a",
				function()
					require("harpoon.mark").add_file()
				end,
				desc = "Add current file to harpoon",
			},
			{
				"<M-à>",
				function()
					require("harpoon.ui").toggle_quick_menu()
				end,
				desc = "Toggle harpoon menu",
			},
			{
				"<M-&>",
				function()
					require("harpoon.ui").nav_file(1)
				end,
				desc = "Goto file 1",
			},
			{
				"<M-é>",
				function()
					require("harpoon.ui").nav_file(2)
				end,
				desc = "Goto file 2",
			},
			{
				'<M-">',
				function()
					require("harpoon.ui").nav_file(3)
				end,
				desc = "Goto file 3",
			},
			{
				"<M-'>",
				function()
					require("harpoon.ui").nav_file(4)
				end,
				desc = "Goto file 4",
			},
		},
	},
}
