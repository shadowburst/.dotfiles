vim.api.nvim_create_autocmd("PackChanged", {
  callback = function(ev)
    local name, kind = ev.data.spec.name, ev.data.kind
    if name == "nvim-treesitter" and kind == "update" then
      if not ev.data.active then
        vim.cmd.packadd("nvim-treesitter")
      end
      vim.cmd("TSUpdate")
    end
  end,
})

vim.pack.add({
  "https://github.com/nvim-treesitter/nvim-treesitter",
})

local treesitter = require("nvim-treesitter")

treesitter.install({
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
  "regex",
  "scss",
  "sql",
  "tsx",
  "typescript",
  "vim",
  "vimdoc",
  "vue",
  "yaml",
})

vim.filetype.add({
  pattern = { ["%.env%.[%w_.-]+"] = "dosini" },
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
