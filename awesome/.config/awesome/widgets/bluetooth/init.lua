local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local widget_container = require('widgets.containers.widget-container')

local icons = beautiful.icons.bluetooth

local create_bluetooth_widget = function()

	local properties = {
		disabled = false
	}

	local buttons = awful.util.table.join(
		awful.button(
			{}, 1,
			function()
				awful.spawn('blueman-manager')
			end
		),
		awful.button(
			{}, 3,
			function()
				awful.spawn.easy_async_with_shell(
					properties.disabled and 'rfkill unblock bluetooth' or 'rfkill block bluetooth',
					function()
						awesome.emit_signal('widgets::bluetooth')
					end
				)
			end
		)
	)

	local bluetooth_widget = widget_container(
		{
			id	   = 'icon',
			markup = '',
			font   = beautiful.nerd_font .. ' 12',
			widget = wibox.widget.textbox
		},
		buttons
	)

	local update_widget = function()
		local color = properties.disabled and beautiful.disabled or beautiful.primary
		local icon = properties.disabled and icons.off or icons.on
		bluetooth_widget:get_children_by_id('icon')[1]:set_markup('<span color="' .. color .. '">' .. icon .. '</span>')
	end


	awesome.connect_signal(
		'widgets::bluetooth',
		function()
			awful.spawn.easy_async_with_shell(
				'rfkill list bluetooth',
				function(stdout)
					properties.disabled = stdout:match('Soft blocked: yes')
					update_widget()
				end
			)
		end
	)

	gears.timer({
		timeout = 5,
		call_now = true,
		autostart = true,
		callback = function()
			awesome.emit_signal('widgets::bluetooth')
		end
	})

	return bluetooth_widget
end

return create_bluetooth_widget()