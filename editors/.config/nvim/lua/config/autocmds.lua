-- Fix folding when opening files with telescope
vim.api.nvim_create_autocmd({ "BufEnter" }, {
	pattern = { "*" },
	command = "normal zx",
})
