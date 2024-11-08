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
				"<leader>bc",
				function()
					Snacks.bufdelete()
				end,
				desc = "Delete buffer",
			},
			{
				"<leader>bo",
				function()
					Snacks.bufdelete.other()
				end,
				desc = "Close other buffers",
			},
		},
	},
}
