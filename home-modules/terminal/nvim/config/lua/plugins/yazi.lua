return {
  {
    "mikavilpas/yazi.nvim",
    dependencies = { "folke/snacks.nvim" },
    lazy = false,
    ---@module 'yazi'
    ---@type YaziConfig
    opts = {
      open_for_directories = true,
      highlight_hovered_buffers_in_same_directory = false,
      floating_window_scaling_factor = 1,
      yazi_floating_window_border = "none",
    },
    init = function() vim.g.loaded_netrwPlugin = 1 end,
    keys = {
      { "<leader>e", "<cmd>Yazi<cr>", desc = "File manager" },
    },
  },
}
