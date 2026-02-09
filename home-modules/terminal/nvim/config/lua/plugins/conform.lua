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
        mago_format = {
          command = "./vendor/bin/mago",
          stdin = true,
          args = { "format", "-i" },
        },
        mago_lint = {
          command = "./vendor/bin/mago",
          stdin = false,
          args = { "lint", "--fix", "$RELATIVE_FILEPATH" },
        },
        pint = { command = "./vendor/bin/pint" },
      },
      formatters_by_ft = {
        ["css"] = { "oxfmt", "prettierd", stop_after_first = true },
        ["graphql"] = { "oxfmt", "prettierd", stop_after_first = true },
        ["html"] = { "oxfmt", "prettierd", stop_after_first = true },
        ["javascript"] = { "oxfmt", "prettierd", stop_after_first = true },
        ["javascriptreact"] = { "oxfmt", "prettierd", stop_after_first = true },
        ["json"] = { "oxfmt", "prettierd", stop_after_first = true },
        ["jsonc"] = { "oxfmt", "prettierd", stop_after_first = true },
        ["less"] = { "oxfmt", "prettierd", stop_after_first = true },
        ["lua"] = { "stylua" },
        ["markdown"] = { "oxfmt", "prettierd", stop_after_first = true },
        ["markdown.mdx"] = { "oxfmt", "prettierd", stop_after_first = true },
        ["php"] = { "mago_format", "pint", stop_after_first = true },
        ["qml"] = { "qmlformat" },
        ["nix"] = { "alejandra" },
        ["scss"] = { "oxfmt", "prettierd", stop_after_first = true },
        ["sh"] = { "shfmt" },
        ["svg"] = { "xmlformat" },
        ["typescript"] = { "oxfmt", "prettierd", stop_after_first = true },
        ["typescriptreact"] = { "oxfmt", "prettierd", stop_after_first = true },
        ["vue"] = { "oxfmt", "prettierd", stop_after_first = true },
        ["xml"] = { "xmlformat" },
        ["yaml"] = { "oxfmt", "prettierd", stop_after_first = true },
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
      {
        "<leader>cl",
        function()
          if vim.tbl_contains({ "php" }, vim.bo.filetype) then
            require("conform").format({ formatters = { "mago_lint" } })
            return
          end
          if
            vim.tbl_contains({
              "javascript",
              "javascriptreact",
              "javascript.jsx",
              "typescript",
              "typescriptreact",
              "typescript.tsx",
              "vue",
            }, vim.bo.filetype)
          then
            require("conform").format({ formatters = { "oxlint" } })
            return
          end
          vim.notify("No linter configured for this filetype", vim.log.levels.WARN)
        end,
        desc = "Lint buffer",
        ft = {
          "javascript",
          "javascriptreact",
          "javascript.jsx",
          "php",
          "typescript",
          "typescriptreact",
          "typescript.tsx",
          "vue",
        },
      },
    },
  },
}
