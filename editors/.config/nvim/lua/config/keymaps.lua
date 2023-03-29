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

map("n", "<leader>w=", "<C-w>=", { desc = "Balance windows" })
map("n", "<leader>wc", "<C-w>c", { desc = "Close window" })
del("n", "<leader>wd")
map("n", "<leader>wm", "<C-w>_<C-w>|", { desc = "Maximize window" })
map("n", "<leader>wM", "<C-w>p<C-w>_<C-w>|", { desc = "Minimize window" })
map("n", "<leader>wo", "<cmd>only<cr>", { desc = "Close other windows" })
map("n", "<leader>ws", "<C-w>s", { desc = "Split window below" })
map("n", "<leader>wv", "<C-w>v", { desc = "Split window right" })

map("n", "<leader>bc", "<cmd>bdelete<cr>", { desc = "Close buffer" })
del("n", "<leader>bd")

map("n", "<leader><tab>c", "<cmd>tabclose<cr>", { desc = "Close Tab" })
del("n", "<leader><tab>d")

-- Handle lazygit myself
del("n", "<leader>gG")

-- Handle terminal myself
del("n", "<leader>ft")
del("n", "<leader>fT")

map("n", "<leader>hr", "<cmd>so $MYVIMRC<cr>", { desc = "Reload config" })
