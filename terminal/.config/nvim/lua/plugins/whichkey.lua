return {
	{
		"folke/which-key.nvim",
		event = "VeryLazy",
		config = function(_, opts)
			local wk = require("which-key")
			wk.setup(opts)
			wk.register({
				mode = { "n", "v" },
				["g"] = { name = "+goto" },
				["<leader>b"] = { name = "+buffers" },
				["<leader>c"] = { name = "+code" },
				["<leader>f"] = { name = "+file/find" },
				["<leader>g"] = { name = "+git" },
				["<leader>h"] = { name = "+harpoon" },
				["<leader>n"] = { name = "+notifications" },
				["<leader>q"] = { name = "+quit" },
				["<leader>s"] = { name = "+search" },
				["<leader>t"] = { name = "+toggle" },
				["<leader>v"] = { name = "+neovim" },
				["<leader>w"] = { name = "+windows" },
				["<leader>x"] = { name = "+diagnostics/quickfix" },
			})
		end,
	},
}
