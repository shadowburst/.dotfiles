-- Fix folding when opening files with telescope
vim.api.nvim_create_autocmd({ "BufEnter" }, {
	pattern = { "*" },
	callback = function()
		-- Only execute in files
		if vim.bo.buftype == "" and vim.bo.filetype ~= "" then
			vim.cmd.normal("zx")
		end
	end,
})
