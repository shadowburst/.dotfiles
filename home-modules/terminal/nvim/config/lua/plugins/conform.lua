return {
  {
    "stevearc/conform.nvim",
    dependencies = { "folke/snacks.nvim" },
    event = { "BufWritePre" },
    cmd = { "ConformInfo" },
    ---@module 'conform'
    ---@type conform.setupOpts
    opts = {
      format_on_save = function(bufnr)
        if vim.g.disable_autoformat or vim.b[bufnr].disable_autoformat then
          return
        end
        return { timeout_ms = 1000, lsp_fallback = true }
      end,
      formatters = {
        mago = {
          command = "./vendor/bin/mago",
          stdin = true,
          args = { "format", "-i" },
        },
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
        ["php"] = { "mago", "pint", stop_after_first = true },
        ["qml"] = { "qmlformat" },
        ["nix"] = { "alejandra" },
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
          get = function() return not vim.b.disable_autoformat end,
          set = function(state) vim.b.disable_autoformat = not state end,
        })
        :map("<leader>tf")
    end,
    keys = {
      {
        "<leader>cf",
        function() require("conform").format() end,
        desc = "Format buffer",
      },
    },
  },
}
