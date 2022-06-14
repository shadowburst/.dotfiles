local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local icons = require('theme.icons')
local helpers = require('helpers')
local widget_container = require('widgets.containers.widget-container')

local properties = {
	charging = false,
	percentage = 0,
}

local check_updates = function()
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
end

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
			font = beautiful.nerd_font .. ' 16',
			markup = helpers.colorize_text(icons.battery_discharging, beautiful.foreground),
			widget = wibox.widget.textbox,
		},
		{
			id = 'battery_percentage',
			text = properties.percentage .. '%',
			widget = wibox.widget.textbox,
		},
	}, buttons, true)

	awesome.connect_signal('widgets::battery', function(args)
		properties = args or properties

		local icon = properties.charging and icons.battery_charging or icons.battery_discharging
		local color = properties.charging and beautiful.primary or beautiful.foreground
		if properties.percentage and properties.percentage <= 20 then
			color = beautiful.danger
		end

		battery_widget:get_children_by_id('icon')[1]:set_markup(helpers.colorize_text(icon, color))
		battery_widget:get_children_by_id('battery_percentage')[1]:set_text(properties.percentage .. '%')
	end)

	check_updates()

	return battery_widget
end

gears.timer({
	timeout = 5,
	call_now = false,
	autostart = true,
	callback = check_updates,
})

return create_battery_widget
