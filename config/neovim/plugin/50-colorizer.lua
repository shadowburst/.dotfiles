vim.pack.add({
  "https://github.com/nvchad/nvim-colorizer.lua",
})

require("colorizer").setup({
  filetypes = {
    "css",
    "html",
    "javascript",
    "javascriptreact",
    "javascript.jsx",
    "nix",
    "scss",
    "typescript",
    "typescriptreact",
    "typescript.tsx",
    "vue",
  },
  parsers = {
    css = true,
    tailwind = {
      enable = true,
      lsp = true,
      update_names = true,
    },
  },
})

Snacks.toggle
  .new({
    name = "colorizer",
    get = function() return require("colorizer").is_buffer_attached() end,
    set = function(state)
      if state then
        require("colorizer").attach_to_buffer()
      else
        require("colorizer").detach_from_buffer()
      end
    end,
  })
  :map("<leader>tc")
