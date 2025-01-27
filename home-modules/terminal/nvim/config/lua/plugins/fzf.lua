return {
	{
		"ibhagwan/fzf-lua",
		dependencies = { "echasnovski/mini.icons" },
		cmd = { "FzfLua" },
		opts = function()
			local actions = require("fzf-lua.actions")
			return {
				"border-fused",
				fzf_opts = { ["--no-scrollbar"] = true },
				winopts = {
					fullscreen = true,
					preview = {
						vertical = "up",
						layout = "vertical",
					},
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
				defaults = {
					prompt = false,
					file_icons = "mini",
					actions = {
						["ctrl-q"] = {
							fn = actions.file_edit_or_qf,
							prefix = "select-all+",
						},
					},
				},
				files = {
					cwd_prompt = false,
					fd_opts = [[--color=never --type f --hidden --follow --no-ignore --exclude .git --exclude node_modules --exclude vendor]],
				},
				oldfiles = { include_current_session = true },
				grep = {
					prompt = "❯ ",
					rg_opts = [[--column --line-number --no-heading --color=always --smart-case --max-columns=4096 --hidden --no-ignore -g '!{.git,node_modules,vendor}' -e ]],
				},
			}
		end,
	},
}
