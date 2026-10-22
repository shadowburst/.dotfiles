vim.g.loaded_netrwPlugin = 1

local function open_superfile(cwd)
  if vim.fn.executable("superfile") ~= 1 then
    Snacks.notify.error("Superfile is not installed")
    return
  end

  local win = vim.api.nvim_get_current_win()
  local choice = vim.fn.tempname()
  local file = not cwd and vim.bo.buftype == "" and vim.api.nvim_buf_get_name(0) or ""
  cwd = cwd or (vim.bo.buftype == "" and vim.fn.expand("%:p:h") or "")
  if cwd == "" then
    cwd = vim.fn.getcwd()
  end

  Snacks.terminal.open({ "superfile", "--chooser-file", choice, vim.fn.filereadable(file) == 1 and file or cwd }, {
    cwd = cwd,
    auto_close = false,
    win = {
      width = 0,
      height = 0,
      border = "none",
      on_buf = function(terminal)
        terminal:on("TermClose", function()
          local path = ""
          if vim.v.event.status == 0 and vim.fn.filereadable(choice) == 1 then
            path = table.concat(vim.fn.readfile(choice, "b"), "\n")
          end
          vim.fn.delete(choice)
          if vim.v.event.status ~= 0 then
            Snacks.notify.error("Superfile exited with code " .. vim.v.event.status)
            return
          end
          terminal:close()
          vim.cmd.checktime()
          if path == "" then
            return
          end
          -- Leave the TermClose event before editing in the original window.
          vim.schedule(function()
            if not vim.api.nvim_win_is_valid(win) then
              return
            end
            local ok, err = pcall(
              vim.api.nvim_win_call,
              win,
              function() vim.api.nvim_cmd({ cmd = "edit", args = { path }, magic = { file = false } }, {}) end
            )
            if not ok then
              Snacks.notify.error(err)
            end
          end)
        end, { buf = true })
        terminal:on("BufWipeout", function() vim.fn.delete(choice) end, { buf = true })
      end,
    },
  })
end

Snacks.keymap.set("n", "<leader>e", function() open_superfile() end, { desc = "File manager" })

vim.api.nvim_create_autocmd("BufEnter", {
  group = vim.api.nvim_create_augroup("custom_superfile", { clear = true }),
  callback = function(event)
    local path = vim.api.nvim_buf_get_name(event.buf)
    if vim.fn.isdirectory(path) ~= 1 then
      return
    end
    vim.schedule(function()
      if vim.api.nvim_get_current_buf() == event.buf and vim.fn.executable("superfile") == 1 then
        vim.api.nvim_buf_delete(event.buf, {})
        open_superfile(path)
      end
    end)
  end,
})
