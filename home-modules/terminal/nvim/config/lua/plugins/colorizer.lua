return {
	{
		"nvchad/nvim-colorizer.lua",
		event = "BufReadPre",
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
				css = true,
				sass = { enable = true },
				tailwind = true,
				mode = "background",
				virtualtext_inline = true,
			},
		},
	},
}
