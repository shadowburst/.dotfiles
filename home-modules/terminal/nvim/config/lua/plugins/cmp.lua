return {
	{
		"saghen/blink.cmp",
		dependencies = "rafamadriz/friendly-snippets",
		version = "v0.*",
		lazy = false,
		---@module 'blink.cmp'
		---@type blink.cmp.Config
		opts = {
			accept = {
				auto_brackets = {
					enabled = false,
				},
			},
			keymap = {
				preset = "default",
				["<C-n>"] = { "show", "select_next", "fallback" },
				["<C-k>"] = { "snippet_forward", "fallback" },
				["<C-j>"] = { "snippet_backward", "fallback" },
			},
			highlight = {
				use_nvim_cmp_as_default = false,
			},
			sources = {
				completion = {
					enabled_providers = { "lsp", "path", "snippets", "buffer", "lazydev" },
				},
				providers = {
					lsp = { fallback_for = { "lazydev" } },
					lazydev = { name = "LazyDev", module = "lazydev.integrations.blink" },
				},
			},
			trigger = {
				signature_help = {
					enabled = true,
				},
			},
			windows = {
				autocomplete = {
					draw = "reversed",
					border = "rounded",
				},
				documentation = {
					auto_show = true,
					border = "rounded",
				},
				signature_help = {
					border = "rounded",
				},
			},
		},
	},
}
