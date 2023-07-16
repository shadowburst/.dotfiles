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

map("n", "<leader>hr", "<cmd>so $MYVIMRC<cr>", { desc = "Reload config" })

if Util.has("vim-bufsurf") then
	map("n", "<S-h>", "<cmd>BufSurfBack<cr>", { desc = "Go to previous buffer in history" })
	map("n", "<S-l>", "<cmd>BufSurfForward<cr>", { desc = "Go to next buffer in history" })
end

-- Disabled from default Lazyvim
del("n", "<leader>gG")
del("n", "<leader>ft")
del("n", "<leader>fT")

-- Add some terminal multiplexing

map("n", "<tab>", "<cmd>tabnext<cr>", { desc = "Go to next tab" })
map("n", "<S-tab>", "<cmd>tabprevious<cr>", { desc = "Go to previous tab" })

map("n", "<leader><tab><tab>", "<cmd>tabnew | terminal<cr><cmd>normal i<cr>", { desc = "Open a new terminal tab" })
map("n", "<leader><tab>c", "<cmd>tabclose<cr>", { desc = "Close Tab" })
del("n", "<leader><tab>d")
del("n", "<leader><tab>[")
del("n", "<leader><tab>]")
del("n", "<leader><tab>f")
del("n", "<leader><tab>l")

map("n", "<leader>sr", ":%s/<C-r><C-w>//gI<Left><Left><Left>", { desc = "Replace current word in buffer" })
