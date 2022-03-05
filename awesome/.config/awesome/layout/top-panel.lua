local beautiful = require('beautiful')
local wibox = require('wibox')

local create_battery = require('widgets.battery')
local create_bluetooth = require('widgets.bluetooth')
local create_brightness = require('widgets.brightness')
local create_clock = require('widgets.clock')
local create_layoutbox = require('widgets.layout-box')
local create_media = require('widgets.media')
local create_network = require('widgets.network')
local create_power = require('widgets.power')
local create_search = require('widgets.search')
local create_torrents = require('widgets.torrents')
local create_updates = require('widgets.updates')
local create_volume = require('widgets.volume')

local dpi = beautiful.xresources.apply_dpi

local top_panel = function(s)
	local panel_height = dpi(28)
	local offsetx = dpi(5)
	local offsety = dpi(8)

	local panel = wibox({
		ontop = false,
		screen = s,
		type = 'dock',
		height = panel_height,
		width = s.geometry.width - offsetx * 2,
		x = s.geometry.x + offsetx,
		y = s.geometry.y + offsety,
		stretch = false,
		bg = beautiful.transparent,
		fg = beautiful.fg_normal,
	})

	panel:struts({
		top = panel_height + offsety,
	})

	local battery = create_battery()
	local bluetooth = create_bluetooth()
	local brightness = create_brightness()
	local clock = create_clock()
	local media = create_media()
	local network = create_network()
	local power = create_power()
	local search = create_search()
	local torrents = create_torrents()
	local updates = create_updates()
	local volume = create_volume()

	s.layout_box = create_layoutbox(s)
	if s == screen.primary then
		s.systray = require('widgets.systray')()
	end
	s.tag_list = require('widgets.tag-list')(s)
	s.task_list = require('widgets.task-list')(s)

	panel:setup({
		layout = wibox.layout.align.horizontal,
		expand = 'none',
		{
			layout = wibox.layout.fixed.horizontal,
			search,
			s.tag_list,
			s.layout_box,
			media,
		},
		s.task_list,
		{
			layout = wibox.layout.fixed.horizontal,
			s.systray,
			torrents,
			updates,
			bluetooth,
			network,
			volume,
			battery,
			brightness,
			clock,
			power,
		},
	})

	return panel
end

return top_panel
