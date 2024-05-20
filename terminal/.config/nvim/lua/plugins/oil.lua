return {
	{
		"stevearc/oil.nvim",
		opts = {
			delete_to_trash = true,
			skip_confirm_for_simple_edits = false,
			prompt_save_on_select_new_entry = true,
			lsp_file_methods = {
				autosave_changes = "unmodified",
			},
			keymaps = {
				["g?"] = "actions.show_help",
				["l"] = "actions.select",
				["<C-p>"] = "actions.preview",
				["<C-l>"] = "actions.refresh",
				["h"] = "actions.parent",
				["g<Space>"] = "actions.cd",
				["gs"] = "actions.change_sort",
				["gx"] = "actions.open_external",
				["g."] = "actions.toggle_hidden",
				["gt"] = "actions.toggle_trash",
				["q"] = {
					desc = "Save and quit",
					callback = function()
						local oil = require("oil")
						oil.save({ confirm = true }, oil.close)
					end,
				},
			},
			use_default_keymaps = false,
			view_options = {
				show_hidden = true,
				is_always_hidden = function(name, bufnr)
					return vim.tbl_contains({ ".git" }, name)
				end,
			},
		},
		config = function(_, opts)
			require("oil").setup(opts)

			vim.api.nvim_create_autocmd("FileType", {
				pattern = "oil_preview",
				callback = function(params)
					vim.keymap.set("n", "<cr>", "y", { buffer = params.buf, remap = true, nowait = true })
				end,
			})
		end,
		keys = {
			{
				"<leader>e",
				function()
					local oil = require("oil")
					oil.open()

					vim.wait(1000, function()
						return oil.get_cursor_entry() ~= nil
					end)
					if oil.get_cursor_entry() then
						oil.open_preview()
					end
				end,
				desc = "Open file explorer",
			},
		},
	},
}
