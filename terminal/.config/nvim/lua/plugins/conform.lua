return {
	{
		"stevearc/conform.nvim",
		dependencies = { "mason.nvim" },
		lazy = true,
		cmd = "ConformInfo",
		opts = {
			formatters_by_ft = {
				["php"] = { "prettierd" },
				["javascript"] = { "prettierd" },
				["javascriptreact"] = { "prettierd" },
				["typescript"] = { "prettierd" },
				["typescriptreact"] = { "prettierd" },
				["vue"] = { "prettierd" },
				["css"] = { "prettierd" },
				["scss"] = { "prettierd" },
				["less"] = { "prettierd" },
				["html"] = { "prettierd" },
				["json"] = { "prettierd" },
				["jsonc"] = { "prettierd" },
				["yaml"] = { "prettierd" },
				["markdown"] = { "prettierd" },
				["markdown.mdx"] = { "prettierd" },
				["graphql"] = { "prettierd" },
				["handlebars"] = { "prettierd" },
				["xml"] = { "xmlformat" },
				["svg"] = { "xmlformat" },
				["rust"] = { "rustfmt" },
			},
			formatters = {
				rustfmt = {
					prepend_args = { "--edition", "2021" },
				},
			},
		},
	},
}
