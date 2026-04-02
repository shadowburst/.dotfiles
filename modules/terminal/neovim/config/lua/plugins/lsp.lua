local config = require("config")

local function accept_word(item)
  local insert_text = item.insert_text
  if type(insert_text) == "string" then
    local range = item.range
    if range then
      local lines = vim.split(insert_text, "\n")
      local current_lines =
        vim.api.nvim_buf_get_text(range.buf, range.start_row, range.start_col, range.end_row, range.end_col, {})

      local row = 1
      while row <= #lines and row <= #current_lines and lines[row] == current_lines[row] do
        row = row + 1
      end

      local col = 1
      while
        row <= #lines
        and col <= #lines[row]
        and row <= #current_lines
        and col <= #current_lines[row]
        and lines[row][col] == current_lines[row][col]
      do
        col = col + 1
      end

      local word = string.match(lines[row]:sub(col), "%s*[^%s]%w*")
      item.insert_text = table.concat(vim.list_slice(lines, 1, row - 1), "\n")
        .. (row <= #current_lines and "" or "\n")
        .. (row <= #lines and col <= #lines[row] and lines[row]:sub(1, col - 1) or "")
        .. word
    end
  end
  return item
end

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
        float = { border = config.border },
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
        copilot = {
          settings = {
            telemetry = { telemetryLevel = "off" },
          },
        },
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

      vim.schedule(function() vim.lsp.inline_completion.enable() end)
    end,
    keys = {
      {
        "<tab>",
        function()
          if not vim.lsp.inline_completion.get({
            on_accept = accept_word,
          }) then
            return "<Tab>"
          end
        end,
        mode = { "i", "s" },
        desc = "Accept word completion",
      },
      {
        "<s-tab>",
        function()
          if not vim.lsp.inline_completion.get() then
            return "<Tab>"
          end
        end,
        mode = { "i", "s" },
        desc = "Accept completion",
      },
    },
  },
}
