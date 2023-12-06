return {
	{
		"stevearc/oil.nvim",
		dependencies = { "nvim-tree/nvim-web-devicons" },
		keys = {

			{
				"<leader>e",
				function()
					require("oil").open()
				end,
				desc = "Toggle oil",
			},
		},
		opts = {
			skip_confirm_for_simple_edits = true,
			keymaps = {
				["<esc><esc>"] = function()
					require("oil").discard_all_changes()
					require("oil").close()
				end,
				["<C-s>"] = function()
					require("oil").save({}, require("oil").close)
				end,
				["<C-h>"] = "actions.parent",
				["<C-l>"] = "actions.select",
				["<CR>"] = "actions.select",
				["<C-p>"] = "actions.preview",
				["g?"] = "actions.show_help",
				["gh"] = "actions.toggle_hidden",
				["go"] = "actions.open_external",
				["gr"] = "actions.refresh",
				["gs"] = "actions.change_sort",
			},
			use_default_keymaps = false,
			view_options = {
				show_hidden = true,
			},
		},
	},
}
