local gears = require('gears')

local icons_dir = gears.filesystem.get_configuration_dir() .. 'theme/icons/'

return {
	arch = '',
	battery = {
		charging = '',
		discharging = '',
	},
	bluetooth = {
		off = '',
		on = '',
	},
	clock = '',
	layout = {
		max = icons_dir .. 'layout/max.svg',
		tiled = icons_dir .. 'layout/tiled.svg',
		floating = icons_dir .. 'layout/floating.svg',
	},
	media = {
		next = '',
		pause = '',
		play = '',
		previous = '',
	},
	network = {
		wifi = {
			off = '睊',
			on = '直',
		},
		speed = {
			up = 'ﰵ',
			down = 'ﰬ',
		},
		ethernet = '',
	},
	power = {
		suspend = '',
		logout = '',
		lock = '',
		reboot = '',
		poweroff = '',
	},
	rpower = '',
	systray = {
		open = '',
		close = '',
	},
	tags = {
		chrome = '',
		code = '',
		chat = '',
		files = '',
		games = '',
		media = '',
		terminal = '',
	},
	torrents = {
		download = '',
		upload = '',
		seeding = '',
	},
	updates = '',
	volume = {
		off = '婢',
		on = '墳',
	},
}
