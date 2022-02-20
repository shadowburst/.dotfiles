local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local clickable_container = require('widgets.containers.clickable-container')

local dpi = beautiful.xresources.apply_dpi

return function(widget, buttons)

    local container = wibox.widget({
        {
            {
                widget,
                top	   = dpi(3),
                bottom = dpi(3),
                left   = dpi(10),
                right  = dpi(10),
                widget = wibox.container.margin
            },
            buttons = buttons,
            widget = clickable_container
        },
        bg 	   = beautiful.background,
        shape  = gears.shape.rounded_rect,
        widget = wibox.container.background
    })

    return container
end
