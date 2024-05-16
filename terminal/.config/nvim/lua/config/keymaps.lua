local map = require("utils.keys").map
local notify = require("utils.notify")

-- Keep previous clipboard if pasting in visual
map("v", "p", '"_dP')
map("s", "p", "p")

-- Center screen on search
map("n", "n", "nzzzv")
map("n", "N", "Nzzzv")

-- Better indenting
map("v", "<", "<gv")
map("v", ">", ">gv")

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

-- Toggle options
map("n", "<leader>td", function()
	local enabled = not vim.diagnostic.is_disabled()
	if enabled then
		vim.diagnostic.disable()
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
