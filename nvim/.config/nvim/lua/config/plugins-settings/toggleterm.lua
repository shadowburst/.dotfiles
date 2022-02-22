local status_ok, toggleterm = pcall(require, 'toggleterm')
if not status_ok then
	return
end

toggleterm.setup({
	size = 15,
	open_mapping = [[<c-\>]],
	hide_numbers = true,
	shade_filetypes = {},
	shade_terminals = false,
	shading_factor = 2,
	start_in_insert = true,
	insert_mappings = true,
	persist_size = true,
	direction = 'float',
	close_on_exit = true,
	shell = vim.o.shell,
	float_opts = {
		border = 'curved',
		winblend = 0,
		highlights = {
			border = 'Normal',
			background = 'Normal',
		},
	},
})

function _G.set_terminal_keymaps()
	local opts = { noremap = true }
	local keymap = vim.api.nvim_buf_set_keymap

	keymap(0, 't', '`', [[<cmd>lua _TOGGLE_TERMINAL()<cr>]], opts)
	keymap(0, 't', 'jk', [[<C-\><C-n>]], opts)
	keymap(0, 't', 'kj', [[<C-\><C-n>]], opts)
	keymap(0, 't', '<C-h>', [[<C-\><C-n><C-W>h]], opts)
	keymap(0, 't', '<C-j>', [[<C-\><C-n><C-W>j]], opts)
	keymap(0, 't', '<C-k>', [[<C-\><C-n><C-W>k]], opts)
	keymap(0, 't', '<C-l>', [[<C-\><C-n><C-W>l]], opts)
	keymap(0, 't', '<C-v>', [[<cmd>lua _SPLIT_TERMINAL()<cr>]], opts)
end

vim.cmd('autocmd! TermOpen term://* lua set_terminal_keymaps()')

local Terminal = require('toggleterm.terminal').Terminal

local lazygit = Terminal:new({ cmd = 'lazygit', hidden = true })
function _LAZYGIT_TOGGLE()
	lazygit:toggle()
end

local lazydocker = Terminal:new({ cmd = 'lazydocker', hidden = true })
function _LAZYDOCKER_TOGGLE()
	lazydocker:toggle()
end

local ranger = Terminal:new({ cmd = 'ranger', hidden = true })
function _RANGER_TOGGLE()
	ranger:toggle()
end

local for_each_terminal = function(cb)
	for _, chan in pairs(vim.api.nvim_list_chans()) do
		if chan.mode == 'terminal' then
			local status, term_name = pcall(function()
				return vim.api.nvim_buf_get_name(chan.buffer)
			end)
			if status then
				cb(term_name)
			end
		end
	end
end

function _TOGGLE_TERMINAL()
	vim.cmd('ToggleTerm direction=horizontal')
end

function _SPLIT_TERMINAL()
	local lowest_term = 1
	for_each_terminal(function(term_name)
		local term = tonumber(term_name:sub(-1))
		if term ~= nil and lowest_term < term then
			lowest_term = term
		end
	end)
	vim.cmd((lowest_term + 1) .. 'ToggleTerm direction=horizontal')
end
