return {
  {
    "aserowy/tmux.nvim",
    event = { "BufNewFile", "BufReadPost", "BufWritePre" },
    opts = {
      navigation = {
        cycle_navigation = true,
        enable_default_keybindings = true,
        persist_zoom = true,
      },
      resize = {
        enable_default_keybindings = true,
        resize_step_x = 3,
        resize_step_y = 3,
      },
    },
  },
}
