local awful = require('awful')
local beautiful = require('beautiful')
local wibox = require('wibox')

local widget_container = require('widgets.containers.widget-container')

local dpi = beautiful.xresources.apply_dpi

local create_layout_widget = function(s)
	local buttons = {
		awful.button({}, 1, function()
			awful.layout.inc(1)
		end),
		awful.button({}, 3, function()
			awful.layout.inc(-1)
		end),
	}

	local layoutbox = widget_container({
		awful.widget.layoutbox({ screen = s }),
		margins = dpi(3),
		widget = wibox.container.margin,
	}, buttons, true)

	return layoutbox
end

return create_layout_widget
