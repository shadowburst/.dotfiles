local awful = require('awful')
local beautiful = require('beautiful')
local wibox = require('wibox')

local icons = require('theme.icons').power
local widget_container = require('widgets.containers.widget-container')

local create_power_widget = function()
	local buttons = awful.util.table.join(awful.button({}, 1, function()
		awesome.emit_signal('module::exit_screen:show')
	end))

	local power_widget = widget_container({
		text = icons.logout,
		font = beautiful.nerd_font .. ' 20',
		align = 'center',
		valign = 'center',
		widget = wibox.widget.textbox,
	}, buttons)

	return power_widget
end

return create_power_widget
