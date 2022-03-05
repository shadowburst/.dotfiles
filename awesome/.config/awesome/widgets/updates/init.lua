local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local apps = require('configuration.apps')
local env = require('env')
local icons = require('theme.icons')
local widget_container = require('widgets.containers.widget-container')

local dpi = beautiful.xresources.apply_dpi

local properties = {
	visible = true,
	update_count = 0,
	tooltip_text = '',
}

local create_updates_widget = function()
	local buttons = {
		awful.button({}, 1, function()
			awful.spawn.easy_async_with_shell(apps.terminal .. ' -e yay -Syu', function() end)
		end),
	}

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
		text = 'Your system is up-to-date',
		delay_show = beautiful.tooltip_delay,
		mode = 'outside',
		align = 'bottom',
		margin_leftright = dpi(8),
		margin_topbottom = dpi(8),
		preferred_positions = { 'right', 'left', 'top', 'bottom' },
	})

	awesome.connect_signal('widgets::updates', function(args)
		if args then
			properties = args
		end

		local text = ' update'
		if properties.update_count ~= 1 then
			text = text .. 's'
		end

		updates_widget:get_children_by_id('updates_count')[1]:set_text(properties.update_count .. text)
		if args.tooltip_text then
			updates_tooltip:set_text(args.tooltip_text)
		end
	end)

	awesome.connect_signal('widgets::updates::hide', function()
		properties.visible = false
		updates_widget:set_visible(false)
	end)

	awesome.connect_signal('widgets::media::show', function()
		properties.visible = true
		updates_widget:set_visible(true)
	end)

	return updates_widget
end

gears.timer({
	timeout = 60,
	call_now = true,
	autostart = true,
	callback = function()
		local args = {
			visible = true,
			update_count = 0,
			tooltip_text = '',
		}

		awful.spawn.easy_async('pamac checkupdates', function(updates)
			args.update_count = tonumber(updates:match('.-\n'):match('%d*')) or 0
			args.visible = env.debug or args.update_count > 0

			if args.visible ~= properties.visible then
				awesome.emit_signal('widgets::updates::' .. (args.visible and 'show' or 'hide'))
			end
			if not args.visible then
				return
			end

			args.tooltip_text = updates
			awesome.emit_signal('widgets::updates', args)
		end)
	end,
})

return create_updates_widget
