local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local apps = require('configuration.apps')
local env = require('env')
local icons = require('theme.icons')
local helpers = require('helpers')
local widget_container = require('widgets.containers.widget-container')

local dpi = beautiful.xresources.apply_dpi

local properties = {
	visible = false,
	update_count = 0,
	tooltip_text = '',
}

local check_updates = function()
	local args = {
		visible = false,
		update_count = 0,
		tooltip_text = '',
	}

	awful.spawn.easy_async('checkupdates', function ()
		awful.spawn.easy_async('yay -Qu', function(updates)
			args.update_count = updates and helpers.count(updates, '\n') or 0
			args.visible = env.debug or args.update_count > 0
			args.tooltip_text = updates

			awesome.emit_signal('widgets::updates', args)
		end)
	end)
end

local create_updates_widget = function()
	local buttons = {
		awful.button({}, 1, function()
			awful.spawn.easy_async_with_shell(apps.terminal .. ' -e yay -Syu', function()
				awesome.emit_signal('widgets::updates')
			end)
		end),
	}

	local updates_widget = widget_container({
		layout = wibox.layout.fixed.horizontal,
		spacing = beautiful.icon_spacing,
		{
			id = 'icon',
			markup = helpers.colorize_text(icons.updates, beautiful.success),
			font = beautiful.nerd_font .. ' 18',
			widget = wibox.widget.textbox,
		},
		{
			id = 'updates_count',
			text = properties.update_count .. ' updates',
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
		properties = args or properties

		updates_widget:set_visible(properties.visible)
		if not properties.visible then
			return
		end

		local text = ' update'
		if properties.update_count ~= 1 then
			text = text .. 's'
		end

		updates_widget:get_children_by_id('updates_count')[1]:set_text(properties.update_count .. text)
		if properties.tooltip_text then
			updates_tooltip:set_text(properties.tooltip_text)
		end
	end)

	check_updates()

	return updates_widget
end

gears.timer({
	timeout = 60,
	call_now = false,
	autostart = true,
	callback = check_updates,
})

return create_updates_widget
