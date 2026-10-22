return function(pane)
  local result = vim.system({ "tmux", "capture-pane", "-p", "-e", "-S", "-", "-t", pane }, { text = true }):wait()
  assert(result.code == 0, "tmux capture failed: " .. (result.stderr or ""))

  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_set_current_buf(buf)
  -- Include the retained history plus the visible screen, without the terminal's default 10k truncation.
  vim.bo[buf].scrollback = 100000
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, vim.split(result.stdout, "\n", { plain = true }))
  require("snacks.terminal").colorize()
  vim.bo[buf].modifiable = false
  vim.bo[buf].readonly = true
  vim.cmd.stopinsert()
  vim.schedule(function() vim.cmd.normal({ args = { "G" }, bang = true }) end)
end
