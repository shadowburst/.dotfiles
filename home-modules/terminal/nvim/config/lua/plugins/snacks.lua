return {
	{
		"folke/snacks.nvim",
		dependencies = {
			"catppuccin/nvim",
		},
		priority = 1000,
		lazy = false,
		opts = function()
			---@module 'snacks'
			---@type snacks.config
			return {
				bigfile = {},
				bufdelete = {},
				dashboard = {
					preset = {
						keys = {
							{ icon = " ", key = "q", desc = "Quit", action = ":q" },
						},
						header = [[
                                                                   
      ████ ██████           █████      ██                    
     ███████████             █████                            
     █████████ ███████████████████ ███   ███████████  
    █████████  ███    █████████████ █████ ██████████████  
   █████████ ██████████ █████████ █████ █████ ████ █████  
 ███████████ ███    ███ █████████ █████ █████ ████ █████ 
██████  █████████████████████ ████ █████ █████ ████ ██████]],
					},
					sections = {
						{ section = "header" },
						{ section = "recent_files", cwd = true, limit = 9, gap = 1, padding = 1 },
						{ section = "keys", padding = 1 },
						{ section = "startup" },
					},
				},
				debug = {},
				gitbrowse = {},
				notifier = {
					top_down = false,
					width = {
						max = 0.25,
					},
				},
				scope = {},
				statuscolumn = {},
				words = {},
				zen = {
					toggles = {
						dim = false,
					},
					show = {
						statusline = true,
					},
					win = {
						width = 0.8,
						backdrop = {
							transparent = false,
							bg = require("catppuccin.palettes").get_palette(require("catppuccin").options.flavour).base,
						},
					},
				},
			}
		end,
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
			{
				"<leader>gb",
				function()
					Snacks.git.blame_line({
						win = {
							backdrop = false,
						},
					})
				end,
				desc = "Blame line",
			},
			{
				"<leader>go",
				function()
					Snacks.gitbrowse()
				end,
				desc = "Open repo",
			},
			{
				"<leader>z",
				function()
					Snacks.zen()
				end,
				desc = "Zen mode",
			},
		},
	},
}
