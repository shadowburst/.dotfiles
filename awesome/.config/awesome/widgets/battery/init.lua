local awful = require('awful')
local beautiful = require('beautiful')
local wibox = require('wibox')

local icons = require('theme.icons').battery
local widget_container = require('widgets.containers.widget-container')

local watch = awful.widget.watch

local create_battery_widget = function()
	local function icon_markup(charging, battery_percentage)
		local icon = charging and icons.charging or icons.discharging
		local color = charging and beautiful.primary or beautiful.foreground
		if battery_percentage and battery_percentage <= 20 then
			color = beautiful.danger
		end
		return '<span color="' .. color .. '">' .. icon .. '</span>'
	end

	local buttons = awful.util.table.join(awful.button({}, 1, function()
		awful.spawn('xfce4-power-manager-settings')
	end))

	local battery_widget = widget_container({
		layout = wibox.layout.fixed.horizontal,
		spacing = beautiful.icon_spacing,
		{
			id = 'icon',
			font = beautiful.nerd_font .. ' 18',
			markup = icon_markup(),
			widget = wibox.widget.textbox,
		},
		{
			id = 'battery_percentage',
			text = '100%',
			widget = wibox.widget.textbox,
		},
	}, buttons, true)

	local update_battery = function(status)
		awful.spawn.easy_async_with_shell(
			[[ bash -c "upower -i $(upower -e | awk '/BAT/') | grep percentage | awk '{print \$2}' | tr -d '\n%'" ]],
			function(stdout)
				local battery_percentage = tonumber(stdout)

				-- Stop if null
				if not battery_percentage or battery_percentage < 0 then
					return
				end

				battery_widget
					:get_children_by_id('icon')[1]
					:set_markup(icon_markup(status == 'charging', battery_percentage))
				battery_widget:get_children_by_id('battery_percentage')[1]:set_text(battery_percentage .. '%')
			end
		)
	end

	-- Watch status if charging, discharging, fully-charged
	watch(
		[[ bash -c "upower -i $(upower -e | awk '/BAT/') | grep state | awk '{print \$2}' | tr -d '\n'" ]],
		5,
		function(_, stdout)
			local status = stdout:gsub('%\n', '')
			update_battery(status)
		end
	)

	return battery_widget
end

return create_battery_widget
