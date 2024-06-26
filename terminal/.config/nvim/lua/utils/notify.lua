local M = {}

function M.info(message, opts)
	vim.notify(message, vim.log.levels.INFO, opts)
end

function M.warn(message, opts)
	vim.notify(message, vim.log.levels.WARN, opts)
end

function M.error(message, opts)
	vim.notify(message, vim.log.levels.ERROR, opts)
end

function M.debug(message, opts)
	vim.notify(message, vim.log.levels.DEBUG, opts)
end

return M
