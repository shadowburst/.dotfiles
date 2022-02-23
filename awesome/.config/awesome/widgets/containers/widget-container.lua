local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local clickable_container = require('widgets.containers.clickable-container')

local dpi = beautiful.xresources.apply_dpi

return function(widget, buttons)
	local container = wibox.widget({
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
	})

	return container
end
