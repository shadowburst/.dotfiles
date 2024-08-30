local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
	vim.fn.system({
		"git",
		"clone",
		"--filter=blob:none",
		"https://github.com/folke/lazy.nvim.git",
		"--branch=stable", -- latest stable release
		lazypath,
	})
end
vim.opt.rtp:prepend(lazypath)

require("lazy").setup("plugins", {
	install = {
		colorscheme = { "tokyonight" },
	},
	defaults = {
		lazy = true,
		version = false,
	},
	checker = {
		enabled = true,
	},
	ui = {
		backdrop = 100,
		border = "rounded",
	},
	pkg = {
		sources = {
			"lazy",
			"packspec",
		},
	},
})

vim.api.nvim_create_autocmd("User", {
	pattern = "VeryLazy",
	callback = function()
		require("config.autocmds")
		require("config.keymaps")
	end,
})
