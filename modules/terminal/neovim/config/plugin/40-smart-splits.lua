vim.api.nvim_create_autocmd("PackChanged", {
  callback = function(ev)
    local name, kind = ev.data.spec.name, ev.data.kind
    if name == "smart-splits" and kind == "update" then
      if not ev.data.active then
        vim.cmd.packadd("smart-splits")
      end
      vim.system({ "./kitty/install-kittens.bash" }, { cwd = ev.data.path })
    end
  end,
})

vim.pack.add({
  "https://github.com/mrjones2014/smart-splits.nvim",
})

require("smart-splits").setup({})

Snacks.keymap.set(
  "n",
  "<C-h>",
  function() require("smart-splits").move_cursor_left() end,
  { desc = "Move to left split" }
)
Snacks.keymap.set(
  "n",
  "<C-j>",
  function() require("smart-splits").move_cursor_down() end,
  { desc = "Move to down split" }
)
Snacks.keymap.set("n", "<C-k>", function() require("smart-splits").move_cursor_up() end, { desc = "Move to up split" })
Snacks.keymap.set(
  "n",
  "<C-l>",
  function() require("smart-splits").move_cursor_right() end,
  { desc = "Move to right split" }
)
