local terminal = 'alacritty'
local emacs = 'emacsclient -c -a "emacs"'

local apps = {
	terminal = terminal,
	browser = 'brave',
	editor = emacs,
    file_manager = emacs .. ' --eval "(ranger)"'
}

return apps
