local map = function(mode, lhs, rhs, opts)
	opts = opts or {}
	opts.silent = opts.silent ~= true
	vim.keymap.set(mode, lhs, rhs, opts)
end
local del = vim.keymap.del

-- Keep previous clipboard if pasting in visual
map("v", "p", '"_dP')

-- Fast exit from normal mode
map("i", "jk", "<esc>")
map("i", "kj", "<esc>")

-- Tabs
map("n", "<leader><tab><tab>", "<cmd>tabnext<cr>", { desc = "Next tab" })
map("n", "<leader><tab>c", "<cmd>tabclose<cr>", { desc = "Close tab" })
map("n", "<leader><tab>o", "<cmd>tabonly<cr>", { desc = "Close other tabs" })
del("n", "<leader><tab>[")
del("n", "<leader><tab>]")
del("n", "<leader><tab>d")
del("n", "<leader><tab>f")
del("n", "<leader><tab>l")

-- Windows
map("n", "<leader>w=", "<C-w>=", { desc = "Balance windows" })
map("n", "<leader>wc", "<C-w>c", { desc = "Close window" })
del("n", "<leader>wd")
map("n", "<leader>wm", "<C-w>_<C-w>|", { desc = "Maximize window" })
map("n", "<leader>wM", "<C-w>p<C-w>_<C-w>|", { desc = "Minimize window" })
map("n", "<leader>wo", "<cmd>only<cr>", { desc = "Close other windows" })
map("n", "<leader>ws", "<C-w>s", { desc = "Split window below" })
map("n", "<leader>wv", "<C-w>v", { desc = "Split window right" })

-- Buffers
map("n", "<leader>bb", "<cmd>e #<cr>", { desc = "Switch to other buffer" })

-- Disabled from default Lazyvim
del("n", "<leader>gG")
del("n", "<leader>ft")
del("n", "<leader>fT")
