local awful = require('awful')
local beautiful = require('beautiful')
local wibox = require('wibox')

local icons = require('theme.icons')
local helpers = require('helpers')
local widget_container = require('widgets.containers.widget-container')

local create_clock_widget = function()
	local time_widget = wibox.widget.textclock('<span font="' .. beautiful.font .. '">%H:%M</span>')
	local calendar_widget = wibox.widget.textclock('<span font="' .. beautiful.font .. '">%d/%m/%y</span>')

	local buttons = {
		awful.button({}, 1, function() end),
	}

	local clock_widget = widget_container({
		id = 'clock_layout',
		layout = wibox.layout.fixed.horizontal,
		spacing = beautiful.icon_spacing,
		{
			markup = helpers.colorize_text(icons.clock, beautiful.primary),
			font = beautiful.nerd_font .. ' 18',
			widget = wibox.widget.textbox,
		},
		time_widget,
	}, buttons, true)

	clock_widget:connect_signal('mouse::enter', function()
		local layout = clock_widget:get_children_by_id('clock_layout')[1]
		layout:swap(1, 2)
		layout:add(calendar_widget)
	end)

	clock_widget:connect_signal('mouse::leave', function()
		local layout = clock_widget:get_children_by_id('clock_layout')[1]
		layout:swap(1, 2)
		layout:remove(3)
	end)

	return clock_widget
end

return create_clock_widget
