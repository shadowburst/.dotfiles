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

-- Center cursor when entering insert mode
vim.api.nvim_create_autocmd({ "TabEnter" }, {
	group = augroup("terminal_insert"),
	callback = function()
		if vim.bo[vim.api.nvim_get_current_buf()].buftype == "terminal" then
			vim.cmd.normal("i")
		end
	end,
})
