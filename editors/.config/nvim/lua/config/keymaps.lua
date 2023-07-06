local Util = require("lazyvim.util")

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

map("n", "<leader>bc", "<cmd>bwipeout<cr>", { desc = "Close buffer" })
del("n", "<leader>bd")

map("n", "<leader><tab>c", "<cmd>tabclose<cr>", { desc = "Close Tab" })
del("n", "<leader><tab>d")

map("n", "<leader>hr", "<cmd>so $MYVIMRC<cr>", { desc = "Reload config" })

if Util.has("vim-bufsurf") then
	map("n", "<S-h>", "<cmd>BufSurfBack<cr>", { desc = "Go to previous buffer in history" })
	map("n", "<S-l>", "<cmd>BufSurfForward<cr>", { desc = "Go to next buffer in history" })
	map("n", "<leader>bo", "<cmd>up | %bd | e# | bd# | BufSurfClear<cr>", { desc = "Close other buffers" })
else
	map("n", "<leader>bo", "<cmd>up | %bd | e# | bd#<cr>", { desc = "Close other buffers" })
end

-- Disabled from default Lazyvim
del("n", "<leader>gG")
del("n", "<leader>ft")
del("n", "<leader>fT")

-- Add some terminal multiplexing

map("n", "<Tab>", "<cmd>tabnext<cr>", { desc = "Go to next tab" })
map("n", "<S-Tab>", "<cmd>tabprevious<cr>", { desc = "Go to previous tab" })

map("n", "<leader>tn", "<cmd>tabnew | terminal<cr><cmd>normal i<cr>", { desc = "Open a new terminal tab" })
map("t", "<C-s>", "<cmd>split | terminal<cr>", { desc = "Horizontal split new terminal" })
map("t", "<C-v>", "<cmd>vsplit | terminal<cr>", { desc = "Vertical split new terminal" })
map("t", "<C-w>", "<cmd>bdelete<cr>", { desc = "Close buffer" })
