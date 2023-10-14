return {
	{
		"stevearc/conform.nvim",
		dependencies = { "mason.nvim" },
		lazy = true,
		cmd = "ConformInfo",
		opts = {
			formatters_by_ft = {
				php = { "phpcbf" },
			},
		},
	},
}
