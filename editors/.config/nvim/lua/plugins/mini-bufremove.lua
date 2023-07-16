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
						local delete = vim.api.nvim_buf_is_loaded(buffer) and buffer ~= current_buffer
						local force = false

						if vim.api.nvim_buf_get_option(buffer, "modified") then
							vim.api.nvim_set_current_buf(buffer)

							local choice = vim.fn.confirm(
								"Save " .. vim.api.nvim_buf_get_name(buffer) .. " ?",
								"&Yes\n&No\n&Cancel"
							)

							if choice == 1 then
								vim.cmd.w()
							elseif choice == 2 then
								force = true
							else
								delete = false
							end
						end

						if delete then
							bufremove.wipeout(buffer, force)
							counter = counter + 1
						end
					end

					vim.api.nvim_set_current_buf(current_buffer)

					vim.notify("Deleted " .. counter .. (counter == 1 and " buffer" or " buffers"))
				end,
				desc = "Close Buffer",
			},
			{
				"<C-w>c",
				function()
					require("mini.bufremove").wipeout(0, false)
				end,
				desc = "Close terminal",
				mode = "t",
			},
			{ "<leader>bd", false },
			{ "<leader>bD", false },
		},
	},
}
