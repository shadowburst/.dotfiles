return {
  {
    "neovim/nvim-lspconfig",
    dependencies = {
      "b0o/SchemaStore.nvim",
      "saghen/blink.cmp",
    },
    event = { "BufReadPost", "BufNewFile", "BufWritePre" },
    config = function()
      local signs = { Error = " ", Warn = " ", Hint = "󰌶 ", Info = " " }
      for type, icon in pairs(signs) do
        local hl = "DiagnosticSign" .. type
        vim.fn.sign_define(hl, { text = icon, texthl = hl, numhl = hl })
      end

      local servers = {
        bashls = {},
        cssls = {},
        dockerls = {},
        docker_compose_language_service = {},
        html = {},
        intelephense = {},
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
        nil_ls = {},
        tailwindcss = {
          filetypes_exclude = { "markdown", "php" },
        },
        volar = {
          init_options = {
            vue = { hybridMode = true },
          },
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
          settings = {
            complete_function_calls = true,
            vtsls = {
              enableMoveToFileCodeAction = true,
              autoUseWorkspaceTsdk = true,
              experimental = {
                completion = {
                  enableServerSideFuzzyMatch = true,
                },
              },
              tsserver = {
                globalPlugins = {
                  {
                    name = "@vue/typescript-plugin",
                    location = vim.fn.readfile(vim.fn.expand("$XDG_CACHE_HOME/nvim/nix/vue_typescript_plugin"), "", 1)[1],
                    languages = { "vue" },
                    configNamespace = "typescript",
                    enableForWorkspaceTypeScriptVersions = true,
                  },
                },
              },
            },
            javascript = {
              suggest = { completeFunctionCalls = true },
            },
            typescript = {
              suggest = { completeFunctionCalls = true },
            },
          },
        },
        yamlls = {
          settings = {
            yaml = {
              schemaStore = {
                enable = false,
                url = "",
              },
              schemas = require("schemastore").yaml.schemas(),
            },
          },
        },
      }

      local on_attach = function(_, buf)
        local map = function(keys, func, desc) vim.keymap.set("n", keys, func, { buffer = buf, desc = desc }) end
        map("<leader>ca", vim.lsp.buf.code_action, "Code action")
        map("<leader>cr", vim.lsp.buf.rename, "Rename variable")
      end

      local capabilities = vim.lsp.protocol.make_client_capabilities()
      for lsp, config in pairs(servers) do
        local settings = config or {}
        settings.on_attach = on_attach
        settings.capabilities = vim.tbl_deep_extend("force", capabilities, settings.capabilities or {})
        require("lspconfig")[lsp].setup(settings)
      end
    end,
  },
}
