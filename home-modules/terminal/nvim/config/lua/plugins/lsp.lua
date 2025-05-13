return {
  {
    "neovim/nvim-lspconfig",
    dependencies = {
      "b0o/SchemaStore.nvim",
      "saghen/blink.cmp",
    },
    event = { "BufReadPost", "BufNewFile", "BufWritePre" },
    config = function()
      vim.diagnostic.config({
        virtual_text = true,
        float = { border = require("util.ui").border },
        signs = {
          text = {
            [vim.diagnostic.severity.ERROR] = " ",
            [vim.diagnostic.severity.WARN] = " ",
            [vim.diagnostic.severity.HINT] = "󰌶 ",
            [vim.diagnostic.severity.INFO] = " ",
          },
        },
      })

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
          root_dir = function(fname)
            local package_json = vim.fs.dirname(vim.fs.find("package.json", { path = fname, upward = true })[1])
            if not package_json then
              return nil
            end
            local file = io.open(package_json .. "/package.json", "r")
            if not file then
              return nil
            end
            local content = file:read("*a")
            file:close()

            if content:match('"tailwindcss"%s*:') then
              return package_json
            else
              return nil
            end
          end,
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
                    location = vim.fn.readfile(
                      vim.fn.expand("$XDG_CACHE_HOME/custom/nvim/vue_typescript_plugin"),
                      "",
                      1
                    )[1],
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
