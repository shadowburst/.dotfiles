local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local clickable_container = require('widgets.containers.clickable-container')

local dpi = beautiful.xresources.apply_dpi

return function(s)
	return awful.widget.taglist({
			screen  = s,
			filter  = awful.widget.taglist.filter.all,
			buttons = {
				awful.button(
					{}, 1,
					function(t)
						t:view_only()
					end
				),
				awful.button(
					{}, 2,
					function(t)
						for _, client in pairs(t:clients()) do
							client:kill()
						end
					end
				),
				awful.button({}, 3, awful.tag.viewtoggle),
				awful.button(
					{}, 4,
					function(t)
						awful.tag.viewprev(t.screen)
					end
				),
				awful.button(
					{}, 5,
					function(t)
						awful.tag.viewnext(t.screen)
					end
				)
			},
			style = {
				shape = gears.shape.rounded_rect,
			},
			widget_template = {
				id 	   = 'background_role',
				widget = wibox.container.background,
				{
					widget = clickable_container,
					{
						widget = wibox.container.margin,
						left   = dpi(8),
						right   = dpi(8),
						{
							id     = 'text_role',
							widget = wibox.widget.textbox
						}
					}
				}
			}
		})
end