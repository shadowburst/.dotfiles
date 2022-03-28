-- ░█████╗░░██╗░░░░░░░██╗███████╗░██████╗░█████╗░███╗░░░███╗███████╗
-- ██╔══██╗░██║░░██╗░░██║██╔════╝██╔════╝██╔══██╗████╗░████║██╔════╝
-- ███████║░╚██╗████╗██╔╝█████╗░░╚█████╗░██║░░██║██╔████╔██║█████╗░░
-- ██╔══██║░░████╔═████║░██╔══╝░░░╚═══██╗██║░░██║██║╚██╔╝██║██╔══╝░░
-- ██║░░██║░░╚██╔╝░╚██╔╝░███████╗██████╔╝╚█████╔╝██║░╚═╝░██║███████╗
-- ╚═╝░░╚═╝░░░╚═╝░░░╚═╝░░╚══════╝╚═════╝░░╚════╝░╚═╝░░░░░╚═╝╚══════╝

local awful = require('awful')
local beautiful = require('beautiful')

local scripts = require('scripts')

require('awful.autofocus')

awful.util.shell = 'zsh'
beautiful.init(require('theme'))

require('layout')
require('configuration')
require('module')

awful.spawn.with_shell(scripts.on_startup)
