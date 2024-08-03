local ft = {
	"css",
	"html",
	"javascript",
	"javascriptreact",
	"javascript.jsx",
	"scss",
	"typescript",
	"typescriptreact",
	"typescript.tsx",
	"vue",
}

return {
	"nvchad/nvim-colorizer.lua",
	ft = ft,
	opts = {
		filetypes = ft,
		user_default_options = {
			css = true,
			sass = { enable = true },
			tailwind = true,
			mode = "background",
			virtualtext_inline = true,
		},
	},
	config = function(_, opts)
		require("colorizer").setup(opts)
	end,
}
