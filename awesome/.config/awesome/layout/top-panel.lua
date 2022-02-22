local beautiful = require('beautiful')
local wibox = require('wibox')

local dpi = beautiful.xresources.apply_dpi

local top_panel = function(s)
	local panel = wibox({
		ontop = false,
		screen = s,
		type = 'dock',
		height = dpi(32),
		width = s.geometry.width,
		x = s.geometry.x,
		y = s.geometry.y,
		stretch = false,
		bg = beautiful.transparent,
		fg = beautiful.fg_normal,
	})

	panel:struts({
		left = 0,
		top = dpi(32),
		right = 0,
		bottom = 0,
	})

	local battery = require('widgets.battery')()
	local bluetooth = require('widgets.bluetooth')()
	local clock = require('widgets.clock')()
	local network = require('widgets.network')()
	local power = require('widgets.power')()
	local search = require('widgets.search')()
	local torrents = require('widgets.torrents')()
	local updates = require('widgets.updates')()
	local volume = require('widgets.volume')()

	s.layout_box = require('widgets.layout-box')(s)
	if s == screen.primary then
		s.systray = require('widgets.systray')()
	end
	s.tag_list = require('widgets.tag-list')(s)
	s.task_list = require('widgets.task-list')(s)

	panel:setup({
		widget = wibox.container.margin,
		left = dpi(4),
		right = dpi(4),
		top = dpi(4),
		{
			layout = wibox.layout.align.horizontal,
			expand = 'none',
			{
				layout = wibox.layout.fixed.horizontal,
				spacing = beautiful.widget_spacing,
				search,
				s.tag_list,
				s.layout_box,
			},
			s.task_list,
			{
				layout = wibox.layout.fixed.horizontal,
				spacing = beautiful.widget_spacing,
				s.systray,
				torrents,
				updates,
				bluetooth,
				network,
				volume,
				battery,
				clock,
				power,
			},
		},
	})

	return panel
end

return top_panel
