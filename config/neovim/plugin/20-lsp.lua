vim.pack.add({
  "https://github.com/b0o/SchemaStore.nvim",
  "https://github.com/neovim/nvim-lspconfig",
})

local servers = {
  bashls = {},
  cssls = {},
  docker_compose_language_service = {},
  dockerls = {},
  html = {},
  jsonls = {
    settings = {
      json = {
        schemas = require("schemastore").json.schemas(),
        validate = { enable = true },
      },
    },
  },
  lua_ls = {
    settings = {
      Lua = {
        workspace = { checkThirdParty = false },
        completion = { callSnippet = "Replace" },
      },
    },
  },
  marksman = {},
  nixd = {},
  phpantom_lsp = {},
  tailwindcss = {
    filetypes_exclude = { "markdown", "php" },
  },
  vtsls = {
    filetypes = {
      "javascript",
      "javascriptreact",
      "javascript.jsx",
      "typescript",
      "typescriptreact",
      "typescript.tsx",
      "vue",
    },
    on_attach = function(client)
      local existing_capabilities = client.server_capabilities
      if vim.bo.filetype == "vue" then
        existing_capabilities.semanticTokensProvider.full = false
      else
        existing_capabilities.semanticTokensProvider.full = true
      end
    end,
    settings = {
      css = {
        validate = true,
        lint = { unknownAtRules = "ignore" },
      },
      complete_function_calls = true,
      vtsls = {
        autoUseWorkspaceTsdk = true,
        experimental = {
          completion = { enableServerSideFuzzyMatch = true },
        },
        tsserver = {
          globalPlugins = {
            {
              name = "@vue/typescript-plugin",
              location = vim.fn.expand("$VUE_TS_PLUGIN_PATH"),
              languages = { "vue" },
              configNamespace = "typescript",
              enableForWorkspaceTypeScriptVersions = true,
            },
          },
        },
      },
      javascript = {
        suggest = { completeFunctionCalls = true },
        preferences = { importModuleSpecifier = "non-relative" },
      },
      typescript = {
        suggest = { completeFunctionCalls = true },
        preferences = { importModuleSpecifier = "non-relative" },
      },
    },
  },
  vue_ls = {},
  yamlls = {
    settings = {
      yaml = {
        schemas = require("schemastore").yaml.schemas(),
        schemaStore = {
          enable = false,
          url = "",
        },
      },
    },
  },
}

for server, settings in pairs(servers) do
  vim.lsp.config(server, settings)
  vim.lsp.enable(server)
end

Snacks.keymap.set("n", "<leader>ca", vim.lsp.buf.code_action, {
  lsp = { method = "textDocument/codeAction" },
  desc = "Code Action",
})
