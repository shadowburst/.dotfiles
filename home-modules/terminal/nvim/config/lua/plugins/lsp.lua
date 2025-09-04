local ui = require("util.ui")

return {
  {
    "neovim/nvim-lspconfig",
    dependencies = {
      "b0o/SchemaStore.nvim",
      "saghen/blink.cmp",
    },
    event = { "VeryLazy" },
    config = function()
      vim.diagnostic.config({
        virtual_text = true,
        float = { border = ui.border },
        signs = {
          text = {
            [vim.diagnostic.severity.ERROR] = " ",
            [vim.diagnostic.severity.WARN] = " ",
            [vim.diagnostic.severity.HINT] = "󰌶 ",
            [vim.diagnostic.severity.INFO] = " ",
          },
        },
      })

      vim.lsp.config("*", {
        on_attach = function(_, buf)
          local map = function(keys, func, desc) vim.keymap.set("n", keys, func, { buffer = buf, desc = desc }) end
          map("<leader>ca", vim.lsp.buf.code_action, "Code action")
          map("<leader>cr", vim.lsp.buf.rename, "Rename variable")
        end,
        capabilities = require("blink-cmp").get_lsp_capabilities(),
      })

      local servers = {
        bashls = {},
        cssls = {},
        docker_compose_language_service = {},
        dockerls = {},
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
        qmlls = {
          cmd = { "qmlls", "-E" },
        },
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
    end,
  },
}
