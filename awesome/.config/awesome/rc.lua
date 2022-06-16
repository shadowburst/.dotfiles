-- ░█████╗░░██╗░░░░░░░██╗███████╗░██████╗░█████╗░███╗░░░███╗███████╗
-- ██╔══██╗░██║░░██╗░░██║██╔════╝██╔════╝██╔══██╗████╗░████║██╔════╝
-- ███████║░╚██╗████╗██╔╝█████╗░░╚█████╗░██║░░██║██╔████╔██║█████╗░░
-- ██╔══██║░░████╔═████║░██╔══╝░░░╚═══██╗██║░░██║██║╚██╔╝██║██╔══╝░░
-- ██║░░██║░░╚██╔╝░╚██╔╝░███████╗██████╔╝╚█████╔╝██║░╚═╝░██║███████╗
-- ╚═╝░░╚═╝░░░╚═╝░░░╚═╝░░╚══════╝╚═════╝░░╚════╝░╚═╝░░░░░╚═╝╚══════╝

local awful = require('awful')
local beautiful = require('beautiful')

local apps = require('configuration.apps')

require('awful.autofocus')

awful.util.shell = 'zsh'
beautiful.init(require('theme'))

require('layout')
require('configuration')
require('module')

awful.spawn.with_shell('feh --no-fehbg --bg-fill "$HOME/.wallpapers/current.jpg"')
