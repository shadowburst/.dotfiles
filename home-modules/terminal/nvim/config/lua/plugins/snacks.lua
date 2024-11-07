return {
	{
		"folke/snacks.nvim",
		priority = 1000,
		lazy = false,
		---@type snacks.Config
		opts = {
			notifier = {
				top_down = false,
				width = {
					max = 0.3,
					min = 0.3,
				},
				style = "fancy",
			},
		},
		init = function()
			vim.api.nvim_create_autocmd("User", {
				pattern = "VeryLazy",
				callback = function()
					-- Setup some globals for debugging (lazy-loaded)
					_G.dd = function(...)
						Snacks.debug.inspect(...)
					end
					vim.print = _G.dd -- Override print to use snacks for `:=` command

					Snacks.toggle.option("spell", { name = "spelling" }):map("<leader>ts")
					Snacks.toggle.option("relativenumber", { name = "relative number" }):map("<leader>tl")
					Snacks.toggle.option("wrap", { name = "wrap" }):map("<leader>tw")
					Snacks.toggle.diagnostics({ name = "diagnostics" }):map("<leader>td")
					Snacks.toggle
						.new({
							name = "formatting",
							get = function()
								return not vim.b.disable_autoformat
							end,
							set = function(state)
								vim.b.disable_autoformat = not state
							end,
						})
						:map("<leader>tf")
				end,
			})
		end,
		keys = {
			{
				"[[",
				function()
					Snacks.words.jump(-vim.v.count1)
				end,
				desc = "Prev reference",
			},
			{
				"]]",
				function()
					Snacks.words.jump(vim.v.count1)
				end,
				desc = "Next reference",
			},
			{
				"<leader>bd",
				function()
					Snacks.bufdelete()
				end,
				desc = "Delete buffer",
			},
			{
				"<leader>bo",
				function()
					local current_buffer = vim.api.nvim_get_current_buf()

					for _, buffer in ipairs(vim.api.nvim_list_bufs()) do
						local should_delete = vim.api.nvim_buf_is_loaded(buffer) and buffer ~= current_buffer

						if should_delete and vim.api.nvim_get_option_value("modified", { buf = buffer }) then
							local choice = vim.fn.confirm(
								"Save " .. vim.api.nvim_buf_get_name(buffer) .. " ?",
								"&Yes\n&No\n&Cancel"
							)

							if choice == 1 then
								vim.api.nvim_buf_call(buffer, vim.cmd.w)
							elseif choice == 0 or choice == 3 then
								should_delete = false
							end
						end

						if should_delete then
							Snacks.bufdelete(buffer)
						end
					end

					vim.api.nvim_set_current_buf(current_buffer)
				end,
				desc = "Close other buffers",
			},
		},
	},
}
