return {
  {
    "folke/snacks.nvim",
    lazy = false,
    priority = 1000,
    ---@module 'snacks'
    ---@type snacks.Config
    opts = {
      bigfile = {},
      debug = {},
      input = {},
      quickfile = {},
      statuscolumn = {},
    },
    init = function()
      vim.api.nvim_create_autocmd("User", {
        pattern = "VeryLazy",
        callback = function()
          -- Setup some globals for debugging (lazy-loaded)
          _G.dd = function(...) Snacks.debug.inspect(...) end
          vim.print = _G.dd -- Override print to use snacks for `:=` command

          Snacks.util.on_key("<esc>", function()
            vim.cmd("noh")
            if vim.snippet then
              vim.snippet.stop()
            end
          end)

          Snacks.toggle.option("spell", { name = "spelling" }):map("<leader>ts")
          Snacks.toggle.option("relativenumber", { name = "relative number" }):map("<leader>tl")
          Snacks.toggle.option("wrap", { name = "wrap" }):map("<leader>tw")
          Snacks.toggle.diagnostics({ name = "diagnostics" }):map("<leader>td")
          Snacks.toggle.profiler():map("<leader>tp")
          Snacks.toggle.zen():map("<leader>z")
        end,
      })
    end,
  },
}
