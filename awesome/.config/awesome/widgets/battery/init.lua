local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local icons = require('theme.icons').battery
local widget_container = require('widgets.containers.widget-container')

local properties = {
	charging = false,
	percentage = 0,
}

local create_battery_widget = function()
	local buttons = {
		awful.button({}, 1, function()
			awful.spawn('xfce4-power-manager-settings')
		end),
	}

	local battery_widget = widget_container({
		layout = wibox.layout.fixed.horizontal,
		spacing = beautiful.icon_spacing,
		{
			id = 'icon',
			font = beautiful.nerd_font .. ' 18',
			markup = '',
			widget = wibox.widget.textbox,
		},
		{
			id = 'battery_percentage',
			text = '',
			widget = wibox.widget.textbox,
		},
	}, buttons, true)

	awesome.connect_signal('widgets::battery', function(args)
		properties = args or properties

		local icon = properties.charging and icons.charging or icons.discharging
		local color = properties.charging and beautiful.primary or beautiful.foreground
		if properties.percentage and properties.percentage <= 20 then
			color = beautiful.danger
		end

		battery_widget:get_children_by_id('icon')[1]:set_markup('<span color="' .. color .. '">' .. icon .. '</span>')
		battery_widget:get_children_by_id('battery_percentage')[1]:set_text(properties.percentage .. '%')
	end)

	return battery_widget
end

gears.timer({
	timeout = 5,
	call_now = true,
	autostart = true,
	callback = function()
		local args = {
			charging = false,
			percentage = 0,
		}

		awful.spawn.easy_async(
			[[ bash -c "upower -i $(upower -e | awk '/BAT/') | awk '/state/ {print \$2}' | tr -d '\n'" ]],
			function(status)
				args.charging = status:gsub('%\n', '') == 'charging'

				awful.spawn.easy_async(
					[[ bash -c "upower -i $(upower -e | awk '/BAT/') | awk '/percentage/ {print \$2}' | tr -d '\n%'" ]],
					function(percentage)
						args.percentage = tonumber(percentage)

						if not args.percentage or args.percentage < 0 then
							return
						end

						if args.charging == properties.charging and args.percentage == properties.percentage then
							return
						end

						awesome.emit_signal('widgets::battery', args)
					end
				)
			end
		)
	end,
})

return create_battery_widget
