---@diagnostic disable:missing-fields
return {
	{
		"saghen/blink.cmp",
		dependencies = {
			"rafamadriz/friendly-snippets",
			"folke/lazydev.nvim",
		},
		version = "v0.*",
		event = { "InsertEnter" },
		---@module 'blink.cmp'
		---@type blink.cmp.Config
		opts = {
			nerd_font_variant = "normal",
			accept = {
				auto_brackets = { enabled = false },
			},
			keymap = {
				preset = "default",
				["<C-n>"] = { "show", "select_next", "fallback" },
				["<C-k>"] = { "snippet_forward", "fallback" },
				["<C-j>"] = { "snippet_backward", "fallback" },
			},
			appearance = { use_nvim_cmp_as_default = false },
			sources = {
				default = { "lsp", "path", "snippets", "buffer", "lazydev" },
				providers = {
					lsp = { fallback_for = { "lazydev" } },
					lazydev = {
						name = "LazyDev",
						module = "lazydev.integrations.blink",
						score_offset = 100, -- show at a higher priority than lsp
					},
				},
			},
			trigger = {
				signature_help = { enabled = true },
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
