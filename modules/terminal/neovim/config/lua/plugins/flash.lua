return {
  {
    "folke/flash.nvim",
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    ---@module 'flash'
    ---@type Flash.Config
    opts = {
      modes = {
        search = {
          enabled = true,
          highlight = { backdrop = true },
          search = {
            wrap = false,
            multi_window = false,
          },
        },
      },
    },
    config = function(_, opts)
      require("flash").setup(opts)

      local gr = vim.api.nvim_create_augroup("custom.flash", {})
      local au = function(event, pattern, callback, desc)
        vim.api.nvim_create_autocmd(event, { pattern = pattern, group = gr, callback = callback, desc = desc })
      end
      local revert_cr = function() vim.keymap.set("n", "<CR>", "<CR>", { buffer = true }) end
      au("FileType", "qf", revert_cr, "Revert <CR>")
      au("CmdwinEnter", "*", revert_cr, "Revert <CR>")
    end,

    keys = {
      {
        "<cr>",
        mode = { "n" },
        function() require("flash").jump() end,
        desc = "Flash jump",
      },
      {
        "<s-cr>",
        mode = { "n" },
        function() require("flash").jump({ continue = true }) end,
        desc = "Flash jump",
      },
      {
        "s",
        mode = { "o" },
        function()
          require("flash").treesitter({
            actions = {
              ["s"] = "next",
              ["S"] = "prev",
            },
          })
        end,
        desc = "Treesitter incremental selection",
      },
      {
        "r",
        mode = { "o" },
        function() require("flash").remote() end,
        desc = "Flash remote",
      },
    },
  },
}
