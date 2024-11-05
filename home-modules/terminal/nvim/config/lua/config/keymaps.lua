local map = require("utils.keys").map
local notify = require("utils.notify")

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

-- Toggle options
map("n", "<leader>td", function()
	local enabled = vim.diagnostic.is_enabled()
	if enabled then
		vim.diagnostic.enable(false)
		notify.warn("Disabled diagnostics")
	else
		vim.diagnostic.enable()
		notify.info("Enabled diagnostics")
	end
end, { desc = "Toggle diagnostics" })

map("n", "<leader>ts", function()
	local enabled = vim.opt_local.spell
	if enabled then
		vim.opt_local.spell = false
		notify.warn("Disabled spell")
	else
		vim.opt_local.spell = true
		notify.info("Enabled spell")
	end
end, { desc = "Toggle spell" })

map("n", "<leader>tw", function()
	local enabled = vim.opt_local.wrap
	if enabled then
		vim.opt_local.wrap = false
		notify.warn("Disabled word wrap")
	else
		vim.opt_local.wrap = true
		notify.info("Enabled word wrap")
	end
end, { desc = "Toggle word wrap" })
