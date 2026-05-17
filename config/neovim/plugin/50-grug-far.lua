vim.pack.add({
  "https://github.com/MagicDuck/grug-far.nvim",
})

require("grug-far").setup({
  headerMaxWidth = 80,
  transient = true,
  visualSelectionUsage = "auto-detect",
})

Snacks.keymap.set(
  { "n", "x" },
  "<leader>sr",
  function()
    require("grug-far").open({
      startCursorRow = vim.fn.mode() == "v" and 2 or 1,
      prefills = {
        paths = vim.fn.expand("%"),
      },
    })
  end,
  { desc = "Replace in file" }
)
Snacks.keymap.set(
  { "n", "x" },
  "<leader>sR",
  function()
    require("grug-far").open({
      startCursorRow = vim.fn.mode() == "v" and 2 or 1,
      prefills = {
        filesFilter = "!.git/",
        flags = "--hidden",
      },
    })
  end,
  { desc = "Replace in files" }
)
