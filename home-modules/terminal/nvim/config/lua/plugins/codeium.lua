return {
	{
		"Exafunction/codeium.nvim",
		dependencies = { "nvim-lua/plenary.nvim" },
		event = { "BufEnter" },
		cmd = { "Codeium" },
		opts = {
			enable_cmp_source = false,
			virtual_text = {
				enabled = true,
				manual = true,
				map_keys = false,
			},
		},
		keys = {
			{
				"<C-Space>",
				mode = { "i" },
				function()
					local codeium = require("codeium.virtual_text")
					if codeium.get_current_completion_item() == nil then
						codeium.complete()
					else
						return codeium.accept()
					end
				end,
				desc = "Codeium completions",
				expr = true,
			},
		},
	},
}
