vim.pack.add({
  "https://github.com/nvim-mini/mini.icons",
  "https://github.com/rafamadriz/friendly-snippets",
  {
    src = "https://github.com/saghen/blink.cmp",
    version = vim.version.range("1.*"),
  },
})

require("blink.cmp").setup({
  cmdline = {
    keymap = {
      preset = "cmdline",
      ["<c-space>"] = {},
      ["<cr>"] = { "accept", "fallback" },
      ["<c-n>"] = { "show_and_insert", "select_next", "fallback" },
      ["<esc>"] = {
        "hide",
        function() vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("<c-c>", true, true, true), "n", true) end,
      },
    },
    completion = {
      ghost_text = { enabled = false },
    },
  },
  keymap = {
    preset = "default",
    ["<c-space>"] = {},
    ["<tab>"] = {},
    ["<s-tab>"] = {},
    ["<c-n>"] = { "show", "select_next", "fallback" },
    ["<c-k>"] = { "snippet_forward", "fallback" },
    ["<c-j>"] = { "snippet_backward", "fallback" },
  },
  appearance = { nerd_font_variant = "normal" },
  sources = {
    default = { "lsp", "path", "snippets", "buffer" },
    per_filetype = {
      lua = { inherit_defaults = true, "lazydev" },
    },
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
      border = vim.g.border,
    },
    documentation = {
      auto_show = true,
      window = { border = vim.g.border },
    },
  },
  signature = {
    enabled = true,
    window = { border = vim.g.border },
  },
})
