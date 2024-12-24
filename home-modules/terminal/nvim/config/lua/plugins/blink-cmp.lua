return {
	{
		"saghen/blink.cmp",
		dependencies = {
			"folke/lazydev.nvim",
			"rafamadriz/friendly-snippets",
		},
		version = "v0.*",
		event = { "InsertEnter" },
		---@module 'blink.cmp'
		---@type blink.cmp.Config
		opts = {
			keymap = {
				preset = "default",
				["<C-n>"] = { "show", "select_next", "fallback" },
				["<C-k>"] = { "snippet_forward", "fallback" },
				["<C-j>"] = { "snippet_backward", "fallback" },
			},
			appearance = { nerd_font_variant = "normal" },
			sources = {
				default = { "lazydev", "lsp", "path", "snippets", "buffer" },
				providers = {
					lazydev = {
						name = "LazyDev",
						module = "lazydev.integrations.blink",
						score_offset = 100, -- show at a higher priority than lsp
					},
				},
			},
			completion = {
				menu = {
					draw = {
						columns = {
							{ "label", "label_description", gap = 1 },
							{ "kind_icon", "kind" },
						},
					},
					border = "rounded",
				},
				documentation = {
					auto_show = true,
					window = { border = "rounded" },
				},
			},
			signature = {
				enabled = true,
				window = { border = "rounded" },
			},
		},
	},
}
