vim.pack.add({
  "https://github.com/folke/which-key.nvim",
})

require("which-key").setup({
  preset = "helix",
  icons = {
    mappings = true,
    rules = {
      { plugin = "nvim-undotree", icon = "", color = "blue" },
      { pattern = "[neo]vim", icon = "", color = "green" },
    },
  },
  defaults = {},
  spec = {
    {
      mode = { "n", "v" },
      { "[", group = "prev" },
      { "]", group = "next" },
      { "z", group = "fold" },
      { "<leader>b", group = "+buffer" },
      { "<leader>c", group = "+code" },
      { "<leader>d", group = "+db" },
      { "<leader>f", group = "+file/find" },
      { "<leader>g", group = "+git" },
      { "<leader>n", group = "+notifications" },
      { "<leader>o", group = "+opencode" },
      { "<leader>q", group = "+quit" },
      { "<leader>s", group = "+search" },
      { "<leader>t", group = "+toggle" },
      { "<leader>v", group = "+neovim" },
      { "<leader>w", group = "+windows", proxy = "<c-w>" },
      { "<leader>x", group = "+diagnostics/quickfix" },
    },
  },
  triggers = {
    { "<auto>", mode = "nixsotc" },
    { "s", mode = { "n", "v" } },
  },
})
