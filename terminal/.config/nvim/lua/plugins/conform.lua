return {
	{
		"stevearc/conform.nvim",
		opts = {
			formatters_by_ft = {
				["css"] = { "prettierd" },
				["go"] = { "gofumpt" },
				["graphql"] = { "prettierd" },
				["html"] = { "prettierd" },
				["javascript"] = { "prettierd" },
				["javascriptreact"] = { "prettierd" },
				["json"] = { "prettierd" },
				["jsonc"] = { "prettierd" },
				["less"] = { "prettierd" },
				["markdown"] = { "prettierd" },
				["markdown.mdx"] = { "prettierd" },
				["rust"] = { "rustfmt" },
				["scss"] = { "prettierd" },
				["svg"] = { "xmlformat" },
				["typescript"] = { "prettierd" },
				["typescriptreact"] = { "prettierd" },
				["vue"] = { "prettierd" },
				["xml"] = { "xmlformat" },
				["yaml"] = { "prettierd" },
			},
			formatters = {
				rustfmt = {
					prepend_args = { "--edition", "2021" },
				},
			},
		},
	},
}
