local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local clickable_container = require('widgets.containers.clickable-container')

local dpi = beautiful.xresources.apply_dpi

return function(widget, buttons, with_margins)
	local container = wibox.widget({
		widget = wibox.container.margin,
		left = with_margins and beautiful.widget_spacing or 0,
		right = with_margins and beautiful.widget_spacing or 0,
		{
			widget = wibox.container.background,
			shape = gears.shape.rounded_rect,
			bg = beautiful.background,
			{
				widget = clickable_container,
				buttons = buttons,
				{
					widget,
					widget = wibox.container.margin,
					top = dpi(3),
					bottom = dpi(3),
					left = dpi(10),
					right = dpi(10),
				},
			},
		},
	})

	return container
end
