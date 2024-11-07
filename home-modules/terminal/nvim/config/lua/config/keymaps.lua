local map = require("utils.keys").map

-- Keep previous clipboard if pasting in visual
map("x", "p", '"_dP')
map("s", "p", "p")

-- Center screen on search
map("n", "n", "nzzzv")
map("n", "N", "Nzzzv")

-- https://github.com/mhinz/vim-galore#saner-behavior-of-n-and-n
map("n", "n", "'Nn'[v:searchforward].'zv'", { expr = true, desc = "Next Search Result" })
map("x", "n", "'Nn'[v:searchforward]", { expr = true, desc = "Next Search Result" })
map("o", "n", "'Nn'[v:searchforward]", { expr = true, desc = "Next Search Result" })
map("n", "N", "'nN'[v:searchforward].'zv'", { expr = true, desc = "Prev Search Result" })
map("x", "N", "'nN'[v:searchforward]", { expr = true, desc = "Prev Search Result" })
map("o", "N", "'nN'[v:searchforward]", { expr = true, desc = "Prev Search Result" })

-- Better indenting
map("x", "<", "<gv")
map("x", ">", ">gv")

-- Clear search with <esc>
map({ "i", "n" }, "<esc>", "<cmd>noh<cr><esc>", { desc = "Escape and clear hlsearch" })

-- save file
map({ "i", "x", "n", "s" }, "<C-s>", "<cmd>w<cr><esc>", { desc = "Save file" })

-- Lazy
map("n", "<leader>l", "<cmd>Lazy<cr>", { desc = "Lazy" })

-- Quit
map("n", "<leader>qq", "<cmd>qa<cr>", { desc = "Quit all" })

-- Buffers
map("n", "<leader>bb", "<cmd>e #<cr>", { desc = "Switch to other buffer" })

-- Quickfix
map("n", "<leader>xq", "<cmd>clist<cr>", { desc = "Quickfix list" })
