return {
	settings = {
		Lua = {
			diagnostics = {
				globals = { 'vim' },
			},
			workspace = {
				library = {
					[vim.fn.expand('$VIMRUNTIME/lua')] = true, -- Vim library
					[vim.fn.stdpath('config') .. '/lua'] = true, -- Custom vim files
					['/usr/share/awesome/lib'] = true, -- Awesome library
				},
			},
		},
	},
}
