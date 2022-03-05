local awful = require('awful')
local beautiful = require('beautiful')
local wibox = require('wibox')

local icons = require('theme.icons')
local scripts = require('scripts')
local widget_container = require('widgets.containers.widget-container')

local create_search_widget = function()
	local buttons = {
		awful.button({}, 1, function()
			awful.spawn.easy_async_with_shell(scripts.app_menu, function() end)
		end),
	}

	local search_widget = widget_container({
		text = icons.arch,
		font = beautiful.nerd_font .. ' 20',
		align = 'center',
		valign = 'center',
		widget = wibox.widget.textbox,
	}, buttons, true)

	return search_widget
end

return create_search_widget
