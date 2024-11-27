return {
	{
		"FabijanZulj/blame.nvim",
		dependencies = {
			"catppuccin/nvim",
		},
		cmd = { "BlameToggle" },
		opts = function()
			return {
				colors = require("catppuccin.palettes").get_palette(require("catppuccin").options.flavour),
			}
		end,
		keys = {
			{
				"<leader>gb",
				"<cmd>BlameToggle virtual<cr>",
				desc = "Toggle blame",
			},
		},
	},
}
