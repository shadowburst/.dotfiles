return {
	{
		"ibhagwan/fzf-lua",
		dependencies = { "echasnovski/mini.icons" },
		cmd = { "FzfLua" },
		opts = function()
			local actions = require("fzf-lua.actions")
			return {
				"default-title",
				fzf_opts = { ["--no-scrollbar"] = true },
				winopts = { fullscreen = true },
				keymap = {
					builtin = {
						false,
						["<C-y>"] = "accept",
						["<C-d>"] = "preview-page-down",
						["<C-u>"] = "preview-page-up",
					},
					fzf = {
						false,
						["ctrl-y"] = "accept",
						["ctrl-d"] = "preview-page-down",
						["ctrl-u"] = "preview-page-up",
					},
				},
				defaults = {
					prompt = false,
					file_icons = "mini",
				},
				files = {
					cwd_prompt = false,
					fd_opts = [[--color=never --type f --hidden --follow --no-ignore --exclude .git --exclude node_modules --exclude vendor]],
				},
				grep = {
					prompt = "❯ ",
					rg_opts = [[--column --line-number --no-heading --color=always --smart-case --max-columns=4096 --hidden --no-ignore -g '!{.git,node_modules,vendor}' -e ]],
					actions = {
						["ctrl-q"] = {
							fn = actions.file_edit_or_qf,
							prefix = "select-all+",
						},
					},
				},
			}
		end,
		keys = {
			{ "<leader><leader>", "<cmd>FzfLua files<cr>", desc = "Find files" },
			{ "<leader>,", "<cmd>FzfLua buffers ignore_current_buffer=true<cr>", desc = "Switch buffer" },
			{ "<leader>/", "<cmd>FzfLua live_grep_glob<cr>", desc = "Grep in files" },
			{ "<leader>:", "<cmd>FzfLua command_history<cr>", desc = "Command history" },
			{ "<leader>.", "<cmd>FzfLua resume<cr>", desc = "Repeat last search" },
			-- Files
			{ "<leader>fr", "<cmd>FzfLua oldfiles cwd_only=true<cr>", desc = "Recent files" },
			-- Git
			{ "<leader>gc", "<cmd>FzfLua git_commits<CR>", desc = "Commits" },
			{ "<leader>gs", "<cmd>FzfLua git_status<CR>", desc = "Status" },
			-- Search
			{ "<leader>sb", "<cmd>FzfLua blines<cr>", desc = "Current buffer" },
			{ "<leader>sc", "<cmd>FzfLua commands<cr>", desc = "Commands" },
			{ "<leader>sd", "<cmd>FzfLua diagnostics_document<cr>", desc = "Document diagnostics" },
			{ "<leader>sD", "<cmd>FzfLua diagnostics_workspace<cr>", desc = "Workspace diagnostics" },
			{ "<leader>sh", "<cmd>FzfLua helptags<cr>", desc = "Help pages" },
			{ "<leader>sH", "<cmd>FzfLua highlights<cr>", desc = "Search highlight groups" },
			{ "<leader>sk", "<cmd>FzfLua keymaps<cr>", desc = "Key maps" },
			{ "<leader>sm", "<cmd>FzfLua manpages<cr>", desc = "Man pages" },
			{ "<leader>ss", "<cmd>FzfLua lsp_document_symbols<cr>", desc = "Document symbols" },
			{ "<leader>sS", "<cmd>FzfLua lsp_live_workspace_symbols<cr>", desc = "Workspace symbols" },
			{
				"<leader>sw",
				function()
					require("fzf-lua").grep_curbuf({ search = vim.fn.expand("<cword>") })
				end,
				desc = "For <cword>",
			},
			{
				"<leader>sw",
				function()
					local fzf = require("fzf-lua")
					fzf.grep_curbuf({ search = fzf.utils.get_visual_selection() })
				end,
				mode = "v",
				desc = "For selection",
			},
			{ "<leader>sW", "<cmd>FzfLua grep_cword<cr>", desc = "For <cword> in cwd" },
			{ "<leader>sW", "<cmd>FzfLua grep_visual<cr>", mode = "v", desc = "For selection in cwd" },
		},
	},
}
