-- Keep previous clipboard if pasting in visual
Snacks.keymap.set("x", "p", '"_dP')
Snacks.keymap.set("s", "p", "p")

-- Center screen on search
Snacks.keymap.set("n", "n", "nzzzv")
Snacks.keymap.set("n", "N", "Nzzzv")

-- https://github.com/mhinz/vim-galore#saner-behavior-of-n-and-n
Snacks.keymap.set("n", "n", "'Nn'[v:searchforward].'zv'", { expr = true, desc = "Next Search Result" })
Snacks.keymap.set("x", "n", "'Nn'[v:searchforward]", { expr = true, desc = "Next Search Result" })
Snacks.keymap.set("o", "n", "'Nn'[v:searchforward]", { expr = true, desc = "Next Search Result" })
Snacks.keymap.set("n", "N", "'nN'[v:searchforward].'zv'", { expr = true, desc = "Prev Search Result" })
Snacks.keymap.set("x", "N", "'nN'[v:searchforward]", { expr = true, desc = "Prev Search Result" })
Snacks.keymap.set("o", "N", "'nN'[v:searchforward]", { expr = true, desc = "Prev Search Result" })

-- Better indenting
Snacks.keymap.set("x", "<", "<gv")
Snacks.keymap.set("x", ">", ">gv")

-- save file
Snacks.keymap.set({ "i", "x", "n", "s" }, "<C-s>", "<cmd>w<cr><esc>", { desc = "Save file" })

-- Quit
Snacks.keymap.set("n", "<leader>qq", "<cmd>qa<cr>", { desc = "Quit all" })

-- Buffers
Snacks.keymap.set("n", "<leader>bb", "<cmd>e #<cr>", { desc = "Switch to other buffer" })

-- Quickfix
Snacks.keymap.set("n", "<leader>xq", "<cmd>copen<cr>", { desc = "Quickfix list" })

Snacks.keymap.set("n", "<leader>vr", "<cmd>restart<cr>", { desc = "Restart Neovim" })
Snacks.keymap.set("n", "<leader>vu", vim.pack.update, { desc = "Update plugins" })
