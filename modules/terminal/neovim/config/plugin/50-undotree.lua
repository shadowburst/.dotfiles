vim.cmd("packadd! nvim.undotree")

Snacks.keymap.set("n", "<leader>u", require("undotree").open, { desc = "Undotree" })
