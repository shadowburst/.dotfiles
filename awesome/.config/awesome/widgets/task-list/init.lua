local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local widget_container = require('widgets.containers.widget-container')

local dpi = beautiful.xresources.apply_dpi

local create_tasklist_widget = function(s)
	return awful.widget.tasklist({
		screen = s,
		filter = awful.widget.tasklist.filter.focused,
		style = {
			shape = gears.shape.rounded_rect,
		},
		buttons = {
			awful.button({}, 1, function()
				awful.client.focus.byidx(1)
			end),
			awful.button({}, 2, function()
				if client.focus then
					client.focus:kill()
				end
			end),
			awful.button({}, 3, function()
				awful.client.focus.byidx(-1)
			end),
		},
		widget_template = widget_container({
			widget = wibox.container.constraint,
			width = dpi(350),
			{
				layout = wibox.layout.fixed.horizontal,
				{
					widget = wibox.container.margin,
					right = dpi(5),
					{
						id = 'icon_role',
						widget = wibox.widget.imagebox,
					},
				},
				{
					id = 'text_role',
					widget = wibox.widget.textbox,
				},
			},
		}),
	})
end

return create_tasklist_widget
