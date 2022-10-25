local opts = { noremap = true, silent = true }

-- Shorten function name
local keymap = vim.api.nvim_set_keymap

--Remap space as leader key
keymap('', '<Space>', '<Nop>', opts)
vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

-- Modes
--   normal_mode = "n",
--   insert_mode = "i",
--   visual_mode = "v",
--   visual_block_mode = "x",
--   term_mode = "t",
--   command_mode = "c",

-- Remove highlighting
keymap('n', '<cr>', '<cmd>nohlsearch<cr><cr>', opts)

-- Toggle terminal
keymap('n', '`', '<cmd>ToggleTerm direction=horizontal<cr>', opts)

-- Easy save
keymap('n', '<C-s>', '<cmd>w<cr>', opts)
keymap('i', '<C-s>', '<esc><cmd>w<cr>', opts)
keymap('v', '<C-s>', '<esc><cmd>w<cr>', opts)

-- Better window navigation
keymap('n', '<C-h>', '<C-w>h', opts)
keymap('n', '<C-j>', '<C-w>j', opts)
keymap('n', '<C-k>', '<C-w>k', opts)
keymap('n', '<C-l>', '<C-w>l', opts)

-- Resize with arrows
keymap('n', '<C-Up>', '<cmd>resize +2<CR>', opts)
keymap('n', '<C-Down>', '<cmd>resize -2<CR>', opts)
keymap('n', '<C-Left>', '<cmd>vertical resize -2<CR>', opts)
keymap('n', '<C-Right>', '<cmd>vertical resize +2<CR>', opts)

-- Navigate buffers
keymap('n', '<S-l>', '<cmd>bnext<CR>', opts)
keymap('n', '<S-h>', '<cmd>bprevious<CR>', opts)

-- Press jk fast to enter normal mode
keymap('i', 'jk', '<esc>', opts)
keymap('i', 'kj', '<esc>', opts)

-- Stay in indent mode when indenting
keymap('v', '<', '<gv', opts)
keymap('v', '>', '>gv', opts)

-- Keep previous clipboard if pasting in visual mode
keymap('v', 'p', '"_dP', opts)

-- Move text up and down
keymap('n', '<A-j>', '<cmd>m .+1<CR>', opts)
keymap('n', '<A-k>', '<cmd>m .-2<CR>', opts)
keymap('i', '<A-j>', '<esc>:m .+1<CR>==gi', opts)
keymap('i', '<A-k>', '<esc>:m .-2<CR>==gi', opts)
keymap('v', '<A-j>', '<cmd>m .+1<CR>==', opts)
keymap('v', '<A-k>', '<cmd>m .-2<CR>==', opts)
keymap('x', '<A-j>', ":move '>+1<CR>gv-gv", opts)
keymap('x', '<A-k>', ":move '<-2<CR>gv-gv", opts)
