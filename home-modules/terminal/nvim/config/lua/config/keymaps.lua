local set = vim.keymap.set

-- Keep previous clipboard if pasting in visual
set("x", "p", '"_dP')
set("s", "p", "p")

-- Center screen on search
set("n", "n", "nzzzv")
set("n", "N", "Nzzzv")

-- https://github.com/mhinz/vim-galore#saner-behavior-of-n-and-n
set("n", "n", "'Nn'[v:searchforward].'zv'", { expr = true, desc = "Next Search Result" })
set("x", "n", "'Nn'[v:searchforward]", { expr = true, desc = "Next Search Result" })
set("o", "n", "'Nn'[v:searchforward]", { expr = true, desc = "Next Search Result" })
set("n", "N", "'nN'[v:searchforward].'zv'", { expr = true, desc = "Prev Search Result" })
set("x", "N", "'nN'[v:searchforward]", { expr = true, desc = "Prev Search Result" })
set("o", "N", "'nN'[v:searchforward]", { expr = true, desc = "Prev Search Result" })

-- Better indenting
set("x", "<", "<gv")
set("x", ">", ">gv")

-- save file
set({ "i", "x", "n", "s" }, "<C-s>", "<cmd>w<cr><esc>", { desc = "Save file" })

-- Lazy
set("n", "<leader>l", "<cmd>Lazy<cr>", { desc = "Lazy" })

-- Quit
set("n", "<leader>qq", "<cmd>qa<cr>", { desc = "Quit all" })

-- Buffers
set("n", "<leader>bb", "<cmd>e #<cr>", { desc = "Switch to other buffer" })

-- Quickfix
set("n", "<leader>xq", "<cmd>copen<cr>", { desc = "Quickfix list" })

-- Execute lua code under cursor
set("n", "<leader>vx", ":.lua<cr>", { desc = "Execute lua code" })
set("x", "<leader>vx", ":lua<cr>", { desc = "Execute lua code" })

set("i", "<M-BS>", "<C-o>db<C-o>dl", { desc = "Delete previous word" })
set("i", "<M-DEL>", "<C-o>de", { desc = "Delete next word" })
