return {
	{
		"stevearc/conform.nvim",
		dependencies = { "mason.nvim" },
		event = { "BufWritePre" },
		cmd = { "ConformInfo" },
		opts = {
			format_on_save = function(bufnr)
				if vim.g.disable_autoformat or vim.b[bufnr].disable_autoformat then
					return
				end
				return { timeout_ms = 500, lsp_fallback = true }
			end,
			formatters_by_ft = {
				["css"] = { "prettierd" },
				["graphql"] = { "prettierd" },
				["html"] = { "prettierd" },
				["javascript"] = { "prettierd" },
				["javascriptreact"] = { "prettierd" },
				["json"] = { "prettierd" },
				["jsonc"] = { "prettierd" },
				["less"] = { "prettierd" },
				["lua"] = { "stylua" },
				["markdown"] = { "prettierd" },
				["markdown.mdx"] = { "prettierd" },
				["nix"] = { "nixfmt" },
				["scss"] = { "prettierd" },
				["sh"] = { "shfmt" },
				["svg"] = { "xmlformat" },
				["typescript"] = { "prettierd" },
				["typescriptreact"] = { "prettierd" },
				["vue"] = { "prettierd" },
				["xml"] = { "xmlformat" },
				["yaml"] = { "prettierd" },
			},
		},
		config = function(_, opts)
			require("conform").setup(opts)

			vim.opt.formatexpr = "v:lua.require'conform'.formatexpr()"
		end,
		keys = {
			{
				"<leader>cf",
				function()
					require("conform").format()
				end,
				desc = "Format buffer",
			},
			{
				"<leader>tf",
				function()
					local notify = require("utils.notify")
					local enabled = not vim.b.disable_autoformat
					if enabled then
						vim.b.disable_autoformat = true
						notify.warn("Disabled formatting")
					else
						vim.b.disable_autoformat = false
						notify.info("Enabled formatting")
					end
				end,
				desc = "Toggle auto format",
			},
		},
	},
}
