local terminal = 'kitty'
local apps = {
	terminal = terminal,
	browser = 'brave',
	editor = terminal .. ' --class nvim,nvim -e nvim',
	file_manager = terminal .. ' --class ranger,ranger -e ranger',
}

return apps
