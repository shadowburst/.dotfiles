local beautiful = require('beautiful')
local wibox = require('wibox')

local dpi = beautiful.xresources.apply_dpi

local top_panel = function(s)
	local panel_height = dpi(36)
	local offsetx = dpi(11)
	local offsety = dpi(8)

	local panel = wibox({
		ontop = false,
		screen = s,
		type = 'dock',
		height = panel_height - offsety,
		width = s.geometry.width - offsetx,
		x = s.geometry.x + offsetx,
		y = s.geometry.y + offsety,
		stretch = false,
		bg = beautiful.transparent,
		fg = beautiful.fg_normal,
	})

	panel:struts({
		top = panel_height,
	})

	local battery = require('widgets.battery')()
	local bluetooth = require('widgets.bluetooth')()
	local clock = require('widgets.clock')()
	local media = require('widgets.media')()
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
		layout = wibox.layout.align.horizontal,
		expand = 'none',
		{
			layout = wibox.layout.fixed.horizontal,
			spacing = beautiful.widget_spacing,
			search,
			s.tag_list,
			s.layout_box,
			media,
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
	})

	return panel
end

return top_panel
