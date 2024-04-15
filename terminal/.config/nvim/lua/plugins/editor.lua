return {
	{
		"echasnovski/mini.ai",
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = function()
			local ai = require("mini.ai")
			return {
				n_lines = 500,
				custom_textobjects = {
					f = ai.gen_spec.treesitter({ a = "@function.outer", i = "@function.inner" }, {}),
					c = ai.gen_spec.treesitter({ a = "@class.outer", i = "@class.inner" }, {}),
					t = { "<([%p%w]-)%f[^<%w][^<>]->.-</%1>", "^<.->().*()</[^/]->$" },
				},
			}
		end,
	},
	{
		"echasnovski/mini.bufremove",
		keys = {
			{
				"<leader>bc",
				function()
					require("mini.bufremove").wipeout(0, false)
				end,
				desc = "Close buffer",
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

						if delete and vim.api.nvim_buf_get_option(buffer, "modified") then
							local choice = vim.fn.confirm(
								"Save " .. vim.api.nvim_buf_get_name(buffer) .. " ?",
								"&Yes\n&No\n&Cancel"
							)

							if choice == 1 then
								vim.api.nvim_buf_call(buffer, vim.cmd.w)
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
				desc = "Close other buffers",
			},
		},
	},
	{
		"echasnovski/mini.comment",
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = {
			options = {
				custom_commentstring = function()
					return require("ts_context_commentstring.internal").calculate_commentstring()
						or vim.bo.commentstring
				end,
			},
		},
	},
	{
		"echasnovski/mini.pairs",
		event = "VeryLazy",
		enabled = false,
		opts = {},
	},
	{
		"echasnovski/mini.surround",
		opts = {
			mappings = {
				add = "sa",
				delete = "sd",
				replace = "sc",
			},
		},
		keys = {
			{ "sa", mode = { "n", "v" }, desc = "Add surrounding" },
			{ "sd", mode = "n", desc = "Delete surrounding" },
			{ "sc", mode = "n", desc = "Replace surrounding" },
		},
	},
	{
		"nvim-pack/nvim-spectre",
		opts = {
			open_cmd = "tabnew",
			highlight = {
				search = "DiffDelete",
				replace = "DiffAdd",
			},
			default = {
				find = {
					options = { "hidden" },
				},
			},
			mapping = {
				["run_current_replace"] = {
					map = "<leader>r",
					cmd = "<cmd>lua require('spectre.actions').run_current_replace()<CR>",
					desc = "replace current line",
				},
			},
		},
		keys = {
			{
				"<leader>sr",
				function()
					require("spectre").open_file_search({ select_word = true })
				end,
				desc = "Replace in current file",
			},
			{
				"<leader>sR",
				function()
					require("spectre").open_visual({ select_word = true })
				end,
				desc = "Replace in files",
			},
		},
	},
	{
		"lambdalisue/suda.vim",
		cmd = { "SudaRead", "SudaWrite" },
		keys = {
			{ "<leader>fs", "<cmd>SudaWrite<cr>", desc = "Sudo write this file" },
			{ "<leader>fS", "<cmd>SudaRead<cr>", desc = "Sudo this file" },
		},
	},
	{
		"johmsalas/text-case.nvim",
		event = { "BufReadPost", "BufNewFile", "BufWritePre" },
		opts = {},
		-- keys = {
		-- 	{ "ga", desc = "Change case" },
		-- },
	},
	{
		"folke/trouble.nvim",
		dependencies = { "nvim-tree/nvim-web-devicons" },
		cmd = { "TroubleToggle", "Trouble" },
		opts = {
			use_diagnostic_signs = true,
		},
		keys = {
			{ "<leader>xx", "<cmd>TroubleToggle document_diagnostics<cr>", desc = "Document diagnostics" },
			{ "<leader>xX", "<cmd>TroubleToggle workspace_diagnostics<cr>", desc = "Workspace diagnostics" },
			{ "<leader>xq", "<cmd>TroubleToggle quickfix<cr>", desc = "Quickfix List" },
		},
	},
	{
		"mbbill/undotree",
		cmd = "UndotreeToggle",
		init = function()
			vim.g.undotree_SetFocusWhenToggle = 1
			vim.g.undotree_WindowLayout = 2
			vim.g.undotree_DiffpanelHeight = 30
			vim.g.undotree_ShortIndicators = 1
			vim.g.undotree_SplitWidth = 30
		end,
		keys = {
			{ "<leader>u", "<cmd>UndotreeToggle<cr>", desc = "Undotree" },
		},
	},
}
