return {
	{
		"MagicDuck/grug-far.nvim",
		opts = {
			startCursorRow = 4,
			headerMaxWidth = 80,
		},
		keys = {
			{
				"<leader>sr",
				function()
					local grug = require("grug-far")

					local is_visual = vim.fn.mode():lower():find("v")

					if is_visual then
						vim.cmd([[normal! v]])
						grug.with_visual_selection({
							prefills = {
								flags = vim.fn.expand("%"),
							},
						})
					else
						grug.grug_far({
							prefills = {
								search = vim.fn.expand("<cword>"),
								flags = vim.fn.expand("%"),
							},
						})
					end
				end,
				desc = "Replace in current file",
			},
			{
				"<leader>sR",
				function()
					local grug = require("grug-far")

					local is_visual = vim.fn.mode():lower():find("v")

					if is_visual then
						vim.cmd([[normal! v]])
						grug.with_visual_selection({})
					else
						grug.grug_far({
							prefills = {
								search = vim.fn.expand("<cword>"),
							},
						})
					end
				end,
				desc = "Replace in files",
			},
		},
	},
}
