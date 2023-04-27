-- Fix folding when opening files with telescope
vim.api.nvim_create_autocmd({ "BufEnter" }, {
	pattern = { "*" },
	callback = function()
		-- Only execute in files
		if vim.bo.buftype ~= "" or vim.bo.filetype == "" then
			return
		end

		vim.cmd.normal("zx")
	end,
})
