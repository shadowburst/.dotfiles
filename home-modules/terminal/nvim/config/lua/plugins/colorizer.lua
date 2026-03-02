return {
  {
    "nvchad/nvim-colorizer.lua",
    event = { "BufReadPre" },
    cmd = { "ColorizerToggle" },
    opts = {
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
      options = {
        parsers = {
          css = true,
          tailwind = {
            enable = true,
            lsp = true,
            update_names = true,
          },
        },
      },
      user_default_options = { suppress_deprecation = true },
    },
    config = function(_, opts)
      local c = require("colorizer")
      c.setup(opts)

      Snacks.toggle
        .new({
          name = "colorizer",
          get = function() return c.is_buffer_attached() end,
          set = function(state)
            if state then
              c.attach_to_buffer()
            else
              c.detach_from_buffer()
            end
          end,
        })
        :map("<leader>tc")
    end,
  },
}
