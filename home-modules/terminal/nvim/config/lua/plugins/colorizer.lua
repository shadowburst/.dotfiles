return {
	{
		"nvchad/nvim-colorizer.lua",
		event = { "BufReadPre" },
		cmd = { "ColorizerToggle" },
		opts = {
			filetypes = {
				"css",
				"html",
				"javascript",
				"javascriptreact",
				"javascript.jsx",
				"nix",
				"scss",
				"typescript",
				"typescriptreact",
				"typescript.tsx",
				"vue",
			},
			user_default_options = {
				mode = "background",
				virtualtext_inline = true,
				css = true,
				sass = {
					enable = true,
					parsers = { "css" },
				},
				tailwind = true,
			},
		},
		config = function(_, opts)
			local c = require("colorizer")
			c.setup(opts)

			Snacks.toggle
				.new({
					name = "colorizer",
					get = function()
						return c.is_buffer_attached() >= 0
					end,
					set = function(state)
						if state then
							c.attach_to_buffer()
						else
							c.detach_from_buffer()
						end
					end,
				})
				:map("<leader>tc")
		end,
	},
}
