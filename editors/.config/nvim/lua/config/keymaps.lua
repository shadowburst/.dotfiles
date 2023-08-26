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

map("n", "<C-h>", function()
	require("tmux").move_left()
end, { desc = "Go to the left window" })
map("n", "<C-j>", function()
	require("tmux").move_bottom()
end, { desc = "Go to the down window" })
map("n", "<C-k>", function()
	require("tmux").move_top()
end, { desc = "Go to the up window" })
map("n", "<C-l>", function()
	require("tmux").move_right()
end, { desc = "Go to the right window" })

map("n", "<A-h>", function()
	require("tmux").resize_left()
end, { desc = "Increase window size left" })
map("n", "<A-j>", function()
	require("tmux").resize_bottom()
end, { desc = "Increase window size down" })
map("n", "<A-k>", function()
	require("tmux").resize_top()
end, { desc = "Increase window size up" })
map("n", "<A-l>", function()
	require("tmux").resize_right()
end, { desc = "Increase window size right" })

-- Buffers
map("n", "<S-h>", function()
	require("harpoon.ui").nav_prev()
end, { desc = "Go to previous marked file" })
map("n", "<S-l>", function()
	require("harpoon.ui").nav_next()
end, { desc = "Go to next marked file" })

map("n", "<leader>bb", "<cmd>e #<cr>", { desc = "Switch to other buffer" })

-- Disabled from default Lazyvim
del("n", "<leader>gG")
del("n", "<leader>ft")
del("n", "<leader>fT")
