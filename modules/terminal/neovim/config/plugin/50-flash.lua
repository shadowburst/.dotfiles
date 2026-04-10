vim.pack.add({
  "https://github.com/folke/flash.nvim",
})

require("flash").setup({
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
})

local gr = vim.api.nvim_create_augroup("custom.flash", {})
local au = function(event, pattern, callback, desc)
  vim.api.nvim_create_autocmd(event, { pattern = pattern, group = gr, callback = callback, desc = desc })
end
local revert_cr = function() vim.keymap.set("n", "<CR>", "<CR>", { buffer = true }) end
au("FileType", "qf", revert_cr, "Revert <CR>")
au("CmdwinEnter", "*", revert_cr, "Revert <CR>")

Snacks.keymap.set("n", "<cr>", function() require("flash").jump() end, { desc = "Flash jump" })
Snacks.keymap.set(
  "n",
  "<s-cr>",
  function() require("flash").jump({ continue = true }) end,
  { desc = "Flash jump continue" }
)
Snacks.keymap.set("o", "r", function() require("flash").remote() end, { desc = "Flash remote" })
Snacks.keymap.set(
  { "o", "x" },
  "v",
  function()
    require("flash").treesitter({
      actions = {
        ["v"] = "next",
        ["V"] = "prev",
      },
    })
  end,
  { desc = "Incremental selection" }
)
