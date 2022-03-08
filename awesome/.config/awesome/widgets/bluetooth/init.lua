local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local icons = require('theme.icons')
local helpers = require('helpers')
local widget_container = require('widgets.containers.widget-container')

local properties = {
	disabled = false,
}

local check_updates = function()
	local args = {
		disabled = false,
	}

	awful.spawn.easy_async('rfkill list bluetooth', function(stdout)
		args.disabled = stdout:match('Soft blocked: yes')

		if args.disabled == properties.disabled then
			return
		end

		awesome.emit_signal('widgets::bluetooth', args)
	end)
end

local create_bluetooth_widget = function()
	local buttons = {
		awful.button({}, 1, function()
			awful.spawn('blueman-manager')
		end),
		awful.button({}, 3, function()
			awful.spawn.easy_async_with_shell(
				properties.disabled and 'rfkill unblock bluetooth' or 'rfkill block bluetooth',
				function()
					awesome.emit_signal('widgets::bluetooth')
				end
			)
		end),
	}

	local bluetooth_widget = widget_container({
		id = 'icon',
		markup = helpers.colorize_text(icons.bluetooth_on, beautiful.primary),
		font = beautiful.nerd_font .. ' 12',
		widget = wibox.widget.textbox,
	}, buttons, true)

	awesome.connect_signal('widgets::bluetooth', function(args)
		properties = args or properties

		local icon = properties.disabled and icons.bluetooth_off or icons.bluetooth_on
		local color = properties.disabled and beautiful.disabled or beautiful.primary

		bluetooth_widget:get_children_by_id('icon')[1]:set_markup(helpers.colorize_text(icon, color))
	end)

	check_updates()

	return bluetooth_widget
end

gears.timer({
	timeout = 5,
	call_now = false,
	autostart = true,
	callback = check_updates,
})

return create_bluetooth_widget
