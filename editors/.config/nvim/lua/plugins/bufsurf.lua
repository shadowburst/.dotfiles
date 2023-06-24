return {
	{
		"ton/vim-bufsurf",
		lazy = false,
		init = function()
			vim.api.nvim_create_autocmd({ "BufEnter" }, {
				pattern = { "*" },
				callback = function()
					-- Only execute in files
					if vim.bo.buftype ~= "" or vim.bo.filetype == "" then
						return
					end

					local window = vim.api.nvim_get_current_win()

					local previousHistory = vim.api.nvim_win_get_var(window, "history")

					if not previousHistory then
						return
					end

					local uniqueValues = {}
					local newHistory = {}

					-- Iterate over the original table in reverse order
					for i = #previousHistory, 1, -1 do
						local value = previousHistory[i]

						-- Check if the value is unique and not already encountered
						if not uniqueValues[value] then
							-- Add the value to the filtered table and mark it as encountered
							table.insert(newHistory, 1, value)
							uniqueValues[value] = true
						end
					end

					vim.api.nvim_win_set_var(window, "history", newHistory)
				end,
			})
		end,
	},
}
