local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local clickable_container = require('widgets.containers.clickable-container')

local dpi = beautiful.xresources.apply_dpi

return function(s)
        return awful.widget.tasklist({
            screen  = s,
            filter  = awful.widget.tasklist.filter.focused,
            style   = {
                shape = gears.shape.rounded_rect
            },
            buttons = {
                awful.button(
                    {}, 1,
                    function()
                        awful.client.focus.byidx(1)
                    end
                ),
                awful.button(
                    {}, 2,
                    function()
                        if client.focus then
                            client.focus:kill()
                        end
                    end
                ),
                awful.button(
                    {}, 3,
                    function()
                        awful.client.focus.byidx(-1)
                    end
                )
            },
            widget_template = {
                id     = 'background_role',
                widget = clickable_container,
                {
                    widget = wibox.container.margin,
                    top    = dpi(3),
                    left   = dpi(10),
                    right   = dpi(10),
                    bottom = dpi(3),
                    {
                        layout = wibox.layout.fixed.horizontal,
                        {
                            widget  = wibox.container.margin,
                            right = dpi(5),
                            {
                                id      = 'icon_role',
                                widget  = wibox.widget.imagebox
                            },
                        },
                        {
                            id     = 'text_role',
                            widget = wibox.widget.textbox,
                        },
                    }
                }
            }
        })
end