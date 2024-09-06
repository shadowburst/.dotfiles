return {
	{
		"ibhagwan/fzf-lua",
		enabled = false,
		dependencies = {
			"echasnovski/mini.icons",
		},
		cmd = { "FzfLua" },
		opts = {
			winopts = {
				backdrop = 100,
			},
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
			files = {
				fd_opts = [[--color=never --type f --hidden --follow --no-ignore --exclude .git --exclude node_modules --exclude vendor]],
			},
		},
		keys = {
			{ "<c-j>", "<c-j>", ft = "fzf", mode = "t", nowait = true },
			{ "<c-k>", "<c-k>", ft = "fzf", mode = "t", nowait = true },
			{ "<leader><leader>", "<cmd>FzfLua files<cr>", desc = "Find files" },
			{ "<leader>,", "<cmd>FzfLua buffers ignore_current_buffer=true<cr>", desc = "Switch Buffer" },
			{ "<leader>/", "<cmd>FzfLua grep<cr>", desc = "Grep in files" },
			{ "<leader>:", "<cmd>FzfLua command_history<cr>", desc = "Command history" },
			{ "<leader>.", "<cmd>FzfLua resume<cr>", desc = "Repeat last search" },
			-- Files
			{ "<leader>fr", "<cmd>FzfLua oldfiles cwd_only=true<cr>", desc = "Recent files" },
			-- Git
			{ "<leader>gc", "<cmd>FzfLua git_commits<CR>", desc = "Commits" },
			{ "<leader>gf", "<cmd>FzfLua git_bcommits<CR>", desc = "Buffer commits" },
			{ "<leader>gs", "<cmd>FzfLua git_status<CR>", desc = "Status" },
			-- Search
			{ "<leader>sb", "<cmd>FzfLua grep_curbuf<cr>", desc = "In buffer" },
			{ "<leader>sc", "<cmd>FzfLua commands<cr>", desc = "Commands" },
			{ "<leader>sd", "<cmd>FzfLua diagnostics_document<cr>", desc = "Document diagnostics" },
			{ "<leader>sD", "<cmd>FzfLua diagnostics_workspace<cr>", desc = "Workspace diagnostics" },
			{ "<leader>sh", "<cmd>FzfLua helptags<cr>", desc = "Help pages" },
			{ "<leader>sH", "<cmd>FzfLua highlights<cr>", desc = "Search highlight groups" },
			{ "<leader>sk", "<cmd>FzfLua keymaps<cr>", desc = "Key maps" },
			{ "<leader>sM", "<cmd>FzfLua manpages<cr>", desc = "Man pages" },
			{ "<leader>sm", "<cmd>FzfLua marks<cr>", desc = "Jump to mark" },
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
			{
				"<leader>sW",
				function()
					require("fzf-lua").grep_curbuf({ search = vim.fn.expand("<cWORD>") })
				end,
				desc = "For <cWORD>",
			},
		},
	},
}
