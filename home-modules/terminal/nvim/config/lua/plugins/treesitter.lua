return {
  {
    "nvim-treesitter/nvim-treesitter",
    dependencies = {
      "folke/ts-comments.nvim",
      "nvim-treesitter/nvim-treesitter-context",
      "nvim-treesitter/nvim-treesitter-textobjects",
    },
    build = ":TSUpdate",
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    opts = {
      auto_install = true,
      ensure_installed = {
        "bash",
        "css",
        "dockerfile",
        "fish",
        "git_config",
        "git_rebase",
        "gitattributes",
        "gitcommit",
        "gitignore",
        "html",
        "hyprlang",
        "javascript",
        "json",
        "lua",
        "make",
        "markdown",
        "markdown_inline",
        "nix",
        "php",
        "phpdoc",
        "regex",
        "scss",
        "sql",
        "tsx",
        "typescript",
        "vim",
        "vimdoc",
        "vue",
        "yaml",
      },
      highlight = { enable = true },
      indent = { enable = true },
    },
    config = function(_, opts)
      require("nvim-treesitter.configs").setup(opts)

      vim.filetype.add({
        pattern = { ["%.env%.[%w_.-]+"] = "sh" },
      })
    end,
  },
  {
    "windwp/nvim-ts-autotag",
    dependencies = { "nvim-treesitter/nvim-treesitter" },
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    opts = { enable = true },
  },
}
