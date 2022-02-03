local awful = require('awful')
local beautiful = require('beautiful')
local wibox = require('wibox')

local icons = require('theme.icons')
local widget_container = require('widgets.containers.widget-container')

local create_clock_widget = function()

	local function widget_markup(content)
		return '<span font="' .. beautiful.font .. '">' .. content .. '</span>'
	end

	local time_widget = wibox.widget.textclock(widget_markup('%H:%M'))
	local calendar_widget = wibox.widget.textclock(widget_markup('%d/%m/%y'))

	local buttons = awful.util.table.join(
		awful.button(
			{}, 1,
			function()
			end
		)
	)

	local clock_widget = widget_container(
		{
			id 		= 'clock_layout',
			layout	= wibox.layout.fixed.horizontal,
			spacing = beautiful.widget_spacing,
			{
				markup = '<span color="' .. beautiful.primary .. '">' .. icons.clock .. '</span>',
				font   = beautiful.nerd_font .. ' 18',
				widget = wibox.widget.textbox
			},
			time_widget,
		},
		buttons
	)

	clock_widget:connect_signal(
		'mouse::enter',
		function()
			local layout = clock_widget:get_children_by_id('clock_layout')[1]
			layout:swap(1, 2)
			layout:add(calendar_widget)
		end
	)

	clock_widget:connect_signal(
		'mouse::leave',
		function()
			local layout = clock_widget:get_children_by_id('clock_layout')[1]
			layout:swap(1, 2)
			layout:remove(3)
		end
	)

	return clock_widget
end

return create_clock_widget