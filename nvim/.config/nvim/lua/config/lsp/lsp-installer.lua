local status_ok, lsp_installer_servers = pcall(require, 'nvim-lsp-installer.servers')
if not status_ok then
	return
end

local servers = {
	{
		name = 'bashls',
		opts = {},
	},
	{
		name = 'ccsls',
		opts = {},
	},
	{
		name = 'dockerls',
		opts = {},
	},
	{
		name = 'html',
		opts = {},
	},
	{
		name = 'jsonls',
		opts = require('config.lsp.settings.jsonls'),
	},
	{
		name = 'tsserver',
		opts = {},
	},
	{
		name = 'sumneko_lua',
		opts = require('config.lsp.settings.sumneko_lua'),
	},
	{
		name = 'yamlls',
		opts = {},
	},
}

for _, configured_server in pairs(servers) do
	local server_available, server = lsp_installer_servers.get_server(configured_server.name)
	if server_available then
		server:on_ready(function()
			local opts = {
				on_attach = require('config.lsp.handlers').on_attach,
				capabilities = require('config.lsp.handlers').capabilities,
			}

			server:setup(vim.tbl_deep_extend('force', configured_server.opts, opts))
		end)
		if not server:is_installed() then
			-- Queue the server to be installed.
			server:install()
		end
	end
end
