local function augroup(name)
	return vim.api.nvim_create_augroup("lazyvim_" .. name, { clear = true })
end

-- Fix folding when opening files with telescope
vim.api.nvim_create_autocmd({ "BufEnter" }, {
	group = augroup("fix_folds"),
	pattern = { "*" },
	callback = function()
		-- Only execute in files
		if vim.bo.buftype ~= "" or vim.bo.filetype == "" then
			return
		end

		vim.cmd.normal("zx")
	end,
})

-- Open help pages in tabs
vim.api.nvim_create_autocmd({ "FileType" }, {
	group = augroup("tab_help"),
	pattern = { "help" },
	callback = function()
		vim.cmd.wincmd("T")
	end,
})
