local awful = require('awful')
local beautiful = require('beautiful')
local wibox = require('wibox')

local widget_container = require('widgets.containers.widget-container')

local dpi = beautiful.xresources.apply_dpi

return function(s)

	local buttons = awful.util.table.join(
		awful.button(
			{}, 1,
			function()
				awful.layout.inc(1)
			end
		),
		awful.button(
			{}, 3,
			function()
				awful.layout.inc(-1)
			end
		)
	)


	local layoutbox = widget_container(
		{
			awful.widget.layoutbox({screen = s}),
			margins = dpi(3),
			widget 	= wibox.container.margin
		},
		buttons
	)

	return layoutbox
end