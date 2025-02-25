return {
  {
    "mikavilpas/yazi.nvim",
    dependencies = { "folke/snacks.nvim" },
    ---@module 'yazi'
    ---@type YaziConfig
    opts = {
      highlight_hovered_buffers_in_same_directory = false,
      floating_window_scaling_factor = 1,
      yazi_floating_window_border = "none",
    },
    keys = {
      { "<leader>e", "<cmd>Yazi<cr>", desc = "File manager" },
    },
  },
}
