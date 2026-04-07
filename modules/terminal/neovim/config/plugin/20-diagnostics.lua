vim.diagnostic.config({
  virtual_text = true,
  float = { border = vim.g.border },
  signs = {
    text = {
      [vim.diagnostic.severity.ERROR] = " ",
      [vim.diagnostic.severity.WARN] = " ",
      [vim.diagnostic.severity.HINT] = "󰌶 ",
      [vim.diagnostic.severity.INFO] = " ",
    },
  },
})

Snacks.keymap.set("n", "<leader>cd", vim.diagnostic.open_float, { desc = "Show diagnostics" })
