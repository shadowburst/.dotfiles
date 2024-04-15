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
