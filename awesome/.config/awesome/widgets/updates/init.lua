local awful = require('awful')
local beautiful = require('beautiful')
local wibox = require('wibox')

local apps = require('configuration.apps')
local env = require('env')
local icons = require('theme.icons')
local widget_container = require('widgets.containers.widget-container')

local dpi = beautiful.xresources.apply_dpi
local watch = awful.widget.watch

local create_updates_widget = function()
	local buttons = awful.util.table.join(awful.button({}, 1, function()
		awful.spawn.easy_async_with_shell(apps.terminal .. ' -e yay -Syu', function(stdout)
			require('gears').debug.dump(stdout)
		end)
	end))

	local updates_widget = widget_container({
		layout = wibox.layout.fixed.horizontal,
		spacing = beautiful.icon_spacing,
		{
			id = 'icon',
			markup = '<span color="' .. beautiful.success .. '">' .. icons.updates .. '</span>',
			font = beautiful.nerd_font .. ' 18',
			widget = wibox.widget.textbox,
		},
		{
			id = 'updates_count',
			text = '',
			widget = wibox.widget.textbox,
		},
	}, buttons, true)

	local updates_tooltip = awful.tooltip({
		objects = { updates_widget },
		text = 'Your system is up-to-date.',
		delay_show = beautiful.tooltip_delay,
		mode = 'outside',
		align = 'bottom',
		margin_leftright = dpi(8),
		margin_topbottom = dpi(8),
		preferred_positions = { 'right', 'left', 'top', 'bottom' },
	})

	local update_widget = function(args)
		local number_of_updates = args.number_of_updates or 0

		local visible = env.debug or number_of_updates ~= 0
		if updates_widget.visible ~= visible then
			updates_widget:set_visible(visible)
		end
		if not visible then
			return
		end

		local text = ' update'
		if number_of_updates ~= 1 then
			text = text .. 's'
		end

		updates_widget:get_children_by_id('updates_count')[1]:set_text(number_of_updates .. text)
		if args.tooltip_text then
			updates_tooltip:set_text(args.tooltip_text)
		end
	end
	update_widget({ number_of_updates = 0 })

	watch('pamac checkupdates', 60, function(_, stdout)
		local number_of_updates = tonumber(stdout:match('.-\n'):match('%d*')) or 0

		update_widget({
			number_of_updates = number_of_updates,
			tooltip_text = stdout,
		})
	end)

	return updates_widget
end

return create_updates_widget
