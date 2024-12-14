return {
	{
		"stevearc/conform.nvim",
		dependencies = {
			"williamboman/mason.nvim",
			"folke/snacks.nvim",
		},
		event = { "BufWritePre" },
		cmd = { "ConformInfo" },
		opts = {
			format_on_save = function(bufnr)
				if vim.g.disable_autoformat or vim.b[bufnr].disable_autoformat then
					return
				end
				return { timeout_ms = 500, lsp_fallback = true }
			end,
			formatters = {
				pint = { command = "./vendor/bin/pint" },
			},
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
				["php"] = { "pint" },
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

			Snacks.toggle
				.new({
					name = "formatting",
					get = function()
						return not vim.b.disable_autoformat
					end,
					set = function(state)
						vim.b.disable_autoformat = not state
					end,
				})
				:map("<leader>tf")
		end,
		keys = {
			{
				"<leader>cf",
				function()
					require("conform").format()
				end,
				desc = "Format buffer",
			},
		},
	},
}
