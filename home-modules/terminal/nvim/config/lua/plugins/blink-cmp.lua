local ui = require("util.ui")

return {
  {
    "saghen/blink.cmp",
    dependencies = {
      "echasnovski/mini.icons",
      "folke/lazydev.nvim",
      "rafamadriz/friendly-snippets",
    },
    version = "v1.*",
    event = { "CmdlineEnter", "InsertEnter" },
    ---@module 'blink.cmp'
    ---@type blink.cmp.Config
    opts = {
      cmdline = {
        keymap = {
          preset = "cmdline",
          ["<C-Space>"] = {},
          ["<cr>"] = { "accept", "fallback" },
          ["<C-n>"] = { "show_and_insert", "select_next", "fallback" },
          ["<esc>"] = {
            "hide",
            function() vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("<C-c>", true, true, true), "n", true) end,
          },
        },
        completion = {
          ghost_text = { enabled = false },
        },
      },
      keymap = {
        preset = "default",
        ["<C-Space>"] = {},
        ["<C-n>"] = { "show", "select_next", "fallback" },
        ["<C-k>"] = { "snippet_forward", "fallback" },
        ["<C-j>"] = { "snippet_backward", "fallback" },
      },
      appearance = { nerd_font_variant = "normal" },
      sources = {
        default = { "lazydev", "lsp", "path", "snippets", "buffer" },
        providers = {
          lazydev = {
            name = "LazyDev",
            module = "lazydev.integrations.blink",
            score_offset = 100, -- show at a higher priority than lsp
          },
        },
      },
      completion = {
        accept = {
          auto_brackets = { enabled = false },
        },
        list = {
          selection = { auto_insert = false },
        },
        menu = {
          auto_show = true,
          draw = {
            columns = {
              { "label", "label_description", gap = 1 },
              { "kind_icon", "kind" },
            },
            components = {
              kind_icon = {
                ellipsis = false,
                text = function(ctx)
                  local kind_icon, _, _ = require("mini.icons").get("lsp", ctx.kind)
                  return kind_icon .. " "
                end,
              },
            },
          },
          border = ui.border,
        },
        documentation = {
          auto_show = true,
          window = { border = ui.border },
        },
      },
      signature = {
        enabled = true,
        window = { border = ui.border },
      },
    },
  },
}
