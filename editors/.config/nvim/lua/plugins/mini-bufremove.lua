return {
	{
		"echasnovski/mini.bufremove",
		keys = {
			{
				"<leader>bc",
				function()
					require("mini.bufremove").wipeout(0, false)
				end,
				desc = "Delete Buffer",
			},
			{
				"<leader>bo",
				function()
					local bufremove = require("mini.bufremove")

					local current_buffer = vim.api.nvim_get_current_buf()

					local counter = 0

					for _, buffer in ipairs(vim.api.nvim_list_bufs()) do
						if vim.api.nvim_buf_is_loaded(buffer) and buffer ~= current_buffer then
							bufremove.wipeout(buffer, false)
							counter = counter + 1
						end
					end

					vim.notify("Deleted " .. counter .. (counter == 1 and " buffer" or " buffers"))
				end,
				desc = "Delete Buffer",
			},
			{ "<leader>bd", false },
			{ "<leader>bD", false },
		},
	},
}
