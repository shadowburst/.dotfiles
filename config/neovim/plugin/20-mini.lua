vim.pack.add({
  "https://github.com/nvim-mini/mini.nvim",
})

require("mini.icons").mock_nvim_web_devicons()

require("mini.ai").setup({
  n_lines = 500,
})

require("mini.align").setup({
  mappings = {
    start = "ga",
    start_with_preview = "",
  },
})

require("mini.bracketed").setup({
  indent = { suffix = "" },
  undo = { suffix = "" },
})

require("mini.operators").setup({
  evaluate = { prefix = "g=" },
  multiply = { prefix = "gm" },
  replace = { prefix = "x" },
  sort = { prefix = "gs" },
})

require("mini.pairs").setup({
  modes = {
    insert = true,
    command = true,
    terminal = false,
  },
})

require("mini.splitjoin").setup({})

require("mini.surround").setup({
  mappings = {
    add = "sa",
    delete = "sd",
    replace = "sc",
    find = "",
    find_left = "",
    highlight = "",
  },
})

Snacks.keymap.set("n", "<s-x>", "x$", { remap = true })
