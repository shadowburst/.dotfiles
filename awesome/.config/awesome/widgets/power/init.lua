local awful = require('awful')
local beautiful = require('beautiful')
local wibox = require('wibox')

local scripts = require('scripts')
local widget_container = require('widgets.containers.widget-container')

local icons = beautiful.icons

local create_power_widget = function()

    local buttons = awful.util.table.join(
        awful.button(
            {}, 1,
            function ()
                awful.spawn.easy_async_with_shell(scripts.power_menu, function() end)
            end
        )
    )

    local power_widget = widget_container(
        {
            text   = icons.power,
            font   = beautiful.nerd_font .. ' 20',
            align  = 'center',
            valign = 'center',
            widget = wibox.widget.textbox
        },
        buttons
    )

    return power_widget
end

return create_power_widget()