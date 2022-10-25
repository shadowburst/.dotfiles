local status_ok, which_key = pcall(require, 'which-key')
if not status_ok then
	return
end

local setup = {
	plugins = {
		marks = true, -- shows a list of your marks on ' and `
		registers = true, -- shows your registers on " in NORMAL or <C-r> in INSERT mode
		spelling = {
			enabled = true, -- enabling this will show WhichKey when pressing z= to select spelling suggestions
			suggestions = 20, -- how many suggestions should be shown in the list?
		},
		-- the presets plugin, adds help for a bunch of default keybindings in Neovim
		-- No actual key bindings are created
		presets = {
			operators = false, -- adds help for operators like d, y, ... and registers them for motion / text object completion
			motions = true, -- adds help for motions
			text_objects = true, -- help for text objects triggered after entering an operator
			windows = true, -- default bindings on <c-w>
			nav = true, -- misc bindings to work with windows
			z = true, -- bindings for folds, spelling and others prefixed with z
			g = true, -- bindings for prefixed with g
		},
	},
	-- add operators that will trigger motion and text object completion
	-- to enable all native operators, set the preset / operators plugin above
	-- operators = { gc = "Comments" },
	key_labels = {
		-- override the label used to display some keys. It doesn't effect WK in any other way.
		-- For example:
		-- ["<space>"] = "SPC",
		-- ["<cr>"] = "RET",
		-- ["<tab>"] = "TAB",
	},
	icons = {
		breadcrumb = '»', -- symbol used in the command line area that shows your active key combo
		separator = '➜', -- symbol used between a key and it's label
		group = '+', -- symbol prepended to a group
	},
	popup_mappings = {
		scroll_down = '<c-d>', -- binding to scroll down inside the popup
		scroll_up = '<c-u>', -- binding to scroll up inside the popup
	},
	window = {
		border = 'rounded', -- none, single, double, shadow
		position = 'bottom', -- bottom, top
		margin = { 1, 0, 1, 0 }, -- extra window margin [top, right, bottom, left]
		padding = { 2, 2, 2, 2 }, -- extra window padding [top, right, bottom, left]
		winblend = 0,
	},
	layout = {
		height = { min = 4, max = 25 }, -- min and max height of the columns
		width = { min = 20, max = 50 }, -- min and max width of the columns
		spacing = 3, -- spacing between columns
		align = 'left', -- align columns left, center or right
	},
	ignore_missing = true, -- enable this to hide mappings for which you didn't specify a label
	hidden = { '<silent>', '<cmd>', '<Cmd>', '<CR>', 'call', 'lua', '^:', '^ ' }, -- hide mapping boilerplate
	show_help = true, -- show help message on the command line when the popup is visible
	triggers = 'auto', -- automatically setup triggers
	-- triggers = {"<leader>"} -- or specify a list manually
	triggers_blacklist = {
		-- list of mode / prefixes that should never be hooked by WhichKey
		-- this is mostly relevant for key maps that start with a native binding
		-- most people should not need to change this
		i = { 'j', 'k' },
		v = { 'j', 'k' },
	},
}

local opts = {
	mode = 'n', -- NORMAL mode
	prefix = '<leader>',
	buffer = nil, -- Global mappings. Specify a buffer number for buffer local mappings
	silent = true, -- use `silent` when creating keymaps
	noremap = true, -- use `noremap` when creating keymaps
	nowait = true, -- use `nowait` when creating keymaps
}

local mappings = {
	['.'] = { '<cmd>Telescope find_files<cr>', 'Browse files' },
	[':'] = { "<cmd>lua require('Comment').toggle()<cr>", 'Comment' },
	['/'] = { '<cmd>Telescope live_grep<cr>', 'Find text' },
	['a'] = { '<cmd>Alpha<cr>', 'Start screen' },
	['b'] = {
		name = '+Buffers',
		['a'] = { '<cmd>BDelete all<cr>', 'Close all' },
		['c'] = { '<cmd>BDelete this<cr>', 'Close current' },
		['f'] = { '<cmd>Telescope buffers<cr>', 'Find' },
		['h'] = { '<cmd>BufferLineCloseLeft<cr>', 'Close all to the left' },
		['j'] = { '<cmd>BufferLinePick<cr>', 'Jump' },
		['l'] = { '<cmd>BufferLineCloseRight<cr>', 'Close all to the right' },
		['o'] = { '<cmd>BDelete other<cr>', 'Close others' },
		['p'] = { '<cmd>BufferLinePickClose<cr>', 'Close pick' },
		['s'] = { '<cmd>wa!<cr>', 'Save all' },
	},
	['d'] = { '<cmd>lua _LAZYDOCKER_TOGGLE()<cr>', 'Open LazyDocker' },
	['e'] = { '<cmd>NvimTreeToggle<CR>', 'Explorer' },
	['g'] = {
		name = '+Git',
		['b'] = { '<cmd>Telescope git_branches<cr>', 'Checkout branch' },
		['c'] = { '<cmd>Telescope git_commits<cr>', 'Checkout commit' },
		['d'] = {
			'<cmd>Gitsigns diffthis HEAD<cr>',
			'Diff',
		},
		['g'] = { '<cmd>lua _LAZYGIT_TOGGLE()<CR>', 'Lazygit' },
		['h'] = { "<cmd>lua require 'gitsigns'.reset_hunk()<cr>", 'Reset Hunk' },
		['p'] = { "<cmd>lua require 'gitsigns'.preview_hunk()<cr>", 'Preview Hunk' },
		['o'] = { '<cmd>Telescope git_status<cr>', 'Open changed file' },
		['r'] = { "<cmd>lua require 'gitsigns'.reset_buffer()<cr>", 'Reset Buffer' },
	},
	['l'] = {
		name = 'LSP',
		['a'] = { '<cmd>lua vim.lsp.buf.code_action()<cr>', 'Code Action' },
		['d'] = {
			'<cmd>Telescope lsp_document_diagnostics<cr>',
			'Document Diagnostics',
		},
		['w'] = {
			'<cmd>Telescope lsp_workspace_diagnostics<cr>',
			'Workspace Diagnostics',
		},
		['f'] = { '<cmd>lua vim.lsp.buf.formatting()<cr>', 'Format' },
		['i'] = { '<cmd>LspInfo<cr>', 'Info' },
		['I'] = { '<cmd>LspInstallInfo<cr>', 'Installer Info' },
		['j'] = {
			'<cmd>lua vim.lsp.diagnostic.goto_next()<CR>',
			'Next Diagnostic',
		},
		['k'] = {
			'<cmd>lua vim.lsp.diagnostic.goto_prev()<cr>',
			'Prev Diagnostic',
		},
		['l'] = { '<cmd>lua vim.lsp.codelens.run()<cr>', 'CodeLens Action' },
		['q'] = { '<cmd>lua vim.lsp.diagnostic.set_loclist()<cr>', 'Quickfix' },
		['r'] = { '<cmd>lua vim.lsp.buf.rename()<cr>', 'Rename' },
		['s'] = { '<cmd>Telescope lsp_document_symbols<cr>', 'Document Symbols' },
		['S'] = {
			'<cmd>Telescope lsp_dynamic_workspace_symbols<cr>',
			'Workspace Symbols',
		},
	},
	['p'] = {
		name = '+Plugins',
		['i'] = { '<cmd>PackerInstall<cr>', 'Install' },
		['s'] = { '<cmd>PackerSync<cr>', 'Sync' },
		['u'] = { '<cmd>PackerUpdate<cr>', 'Update' },
	},
	['q'] = { '<cmd>qa<CR>', 'Quit' },
	['r'] = { '<cmd>lua _RANGER_TOGGLE()<CR>', 'Open Ranger' },
	['s'] = {
		name = '+Spell',
		['e'] = { '<cmd>setlocal spell spelllang=en<cr>', 'Set spell lang to english' },
		['f'] = { '<cmd>setlocal spell spelllang=fr<cr>', 'Set spell lang to french' },
		['x'] = { '<cmd>setlocal nospell<cr>', 'Remove spell check' },
	},
	['t'] = { '<cmd>ToggleTerm direction=horizontal<cr>', 'Open Terminal' },
	['w'] = {
		name = '+Windows',
		['w'] = { '<C-W>p', 'Other window' },
		['c'] = { '<C-W>c', 'Close window' },
		['h'] = { '<C-W>h', 'Window left' },
		['j'] = { '<C-W>j', 'Window below' },
		['l'] = { '<C-W>l', 'Window right' },
		['k'] = { '<C-W>k', 'Window up' },
		['='] = { '<C-W>=', 'Balance window' },
		['s'] = { '<C-W>s', 'Split window below' },
		['v'] = { '<C-W>v', 'Split window right' },
	},
	['x'] = { '<cmd>BDelete this<cr>', 'Close current buffer' },
}

which_key.setup(setup)
which_key.register(mappings, opts)
