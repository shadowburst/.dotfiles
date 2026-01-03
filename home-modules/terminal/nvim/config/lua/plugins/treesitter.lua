return {
  {
    "nvim-treesitter/nvim-treesitter",
    dependencies = {
      "folke/ts-comments.nvim",
      "nvim-treesitter/nvim-treesitter-context",
    },
    lazy = false,
    build = ":TSUpdate",
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    opts = {
      ensure_installed = {
        "bash",
        "blade",
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
        "qmljs",
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
    },
    config = function(_, opts)
      local TS = require("nvim-treesitter")
      TS.setup()

      TS.install(opts.ensure_installed)

      vim.filetype.add({
        pattern = { ["%.env%.[%w_.-]+"] = "sh" },
      })

      vim.api.nvim_create_autocmd("FileType", {
        group = vim.api.nvim_create_augroup("treesitter.setup", {}),
        callback = function(ev)
          local buf = ev.buf
          local filetype = ev.match

          local language = vim.treesitter.language.get_lang(filetype) or filetype
          if not vim.treesitter.language.add(language) then
            return
          end

          vim.wo.foldmethod = "expr"
          vim.wo.foldexpr = "v:lua.vim.treesitter.foldexpr()"

          vim.treesitter.start(buf, language)

          vim.bo[buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
        end,
      })
    end,
  },
  {
    "windwp/nvim-ts-autotag",
    dependencies = { "nvim-treesitter/nvim-treesitter" },
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    opts = { enable = true },
  },
  {
    "nvim-treesitter/nvim-treesitter-context",
    opts = {
      max_lines = 4,
      mode = "line",
      multiwindow = true,
    },
  },
  {
    "nvim-treesitter/nvim-treesitter-textobjects",
    branch = "main",
    event = "VeryLazy",
    opts = {},
    keys = function()
      local moves = {
        goto_next_start = { ["]f"] = "@function.outer", ["]c"] = "@class.outer", ["]a"] = "@parameter.inner" },
        goto_next_end = { ["]F"] = "@function.outer", ["]C"] = "@class.outer", ["]A"] = "@parameter.inner" },
        goto_previous_start = { ["[f"] = "@function.outer", ["[c"] = "@class.outer", ["[a"] = "@parameter.inner" },
        goto_previous_end = { ["[F"] = "@function.outer", ["[C"] = "@class.outer", ["[A"] = "@parameter.inner" },
      }
      local ret = {}
      for method, keymaps in pairs(moves) do
        for key, query in pairs(keymaps) do
          local desc = query:gsub("@", ""):gsub("%..*", "")
          desc = desc:sub(1, 1):upper() .. desc:sub(2)
          desc = (key:sub(1, 1) == "[" and "Prev " or "Next ") .. desc
          desc = desc .. (key:sub(2, 2) == key:sub(2, 2):upper() and " End" or " Start")
          ret[#ret + 1] = {
            key,
            function()
              -- don't use treesitter if in diff mode and the key is one of the c/C keys
              if vim.wo.diff and key:find("[cC]") then
                return vim.cmd("normal! " .. key)
              end
              require("nvim-treesitter-textobjects.move")[method](query, "textobjects")
            end,
            desc = desc,
            mode = { "n", "x", "o" },
            silent = true,
          }
        end
      end
      return ret
    end,
  },
}
