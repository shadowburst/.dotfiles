local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local apps = require('configuration.apps')
local env = require('env')
local icons = require('theme.icons').torrents
local scripts = require('scripts')
local widget_container = require('widgets.containers.widget-container')

local count = function(str, pattern)
	return select(2, str:gsub(pattern, pattern))
end

local properties = {
	visible = false,
	download_count = 0,
	upload_cound = 0,
	tooltip_text = '',
}

local check_updates = function()
	local args = {
		visible = false,
		download_count = 0,
		upload_cound = 0,
		tooltip_text = '',
	}

	awful.spawn.easy_async_with_shell('transmission-remote -l', function(stdout)
		local total = count(stdout, '\n') - 2

		args.visible = env.debug or total > 0
		args.upload_count = count(stdout, '100%%')
		args.download_count = total - args.upload_count
		args.tooltip_text = stdout

		awesome.emit_signal('widgets::torrents', args)
	end)
end

local create_torrents_widget = function()
	local buttons = {
		awful.button({}, 1, function()
			awful.spawn(apps.terminal .. ' -e tremc')
		end),
		awful.button({}, 3, function()
			awful.spawn.easy_async_with_shell(scripts.clear_torrents, function()
				check_updates()
			end)
		end),
	}

	local torrents_widget = widget_container({
		layout = wibox.layout.fixed.horizontal,
		spacing = beautiful.icon_spacing * 2,
		{
			layout = wibox.layout.fixed.horizontal,
			spacing = beautiful.icon_spacing,
			{
				markup = '<span color="' .. beautiful.success .. '">' .. icons.download .. '</span>',
				font = beautiful.nerd_font .. ' 18',
				widget = wibox.widget.textbox,
			},
			{
				id = 'download_count',
				text = properties.download_count,
				widget = wibox.widget.textbox,
			},
		},
		{
			layout = wibox.layout.fixed.horizontal,
			spacing = beautiful.icon_spacing,
			{
				markup = '<span color="' .. beautiful.warning .. '">' .. icons.upload .. '</span>',
				font = beautiful.nerd_font .. ' 18',
				widget = wibox.widget.textbox,
			},
			{
				id = 'upload_count',
				text = properties.upload_cound,
				widget = wibox.widget.textbox,
			},
		},
	}, buttons, true)

	local torrents_tooltip = awful.tooltip({
		objects = { torrents_widget },
		text = 'None',
		delay_show = beautiful.tooltip_delay,
		mode = 'outside',
		margins = beautiful.tooltip_margins,
		preferred_positions = { 'right', 'left', 'top', 'bottom' },
	})

	awesome.connect_signal('widgets::torrents', function(args)
		properties = args or properties

		torrents_widget:set_visible(properties.visible)
		if not properties.visible then
			return
		end

		if properties.download_count then
			torrents_widget:get_children_by_id('download_count')[1]:set_text(properties.download_count)
		end

		if properties.upload_count then
			torrents_widget:get_children_by_id('upload_count')[1]:set_text(properties.upload_count)
		end

		torrents_tooltip:set_text(properties.tooltip_text)
	end)

	check_updates()

	return torrents_widget
end

gears.timer({
	timeout = 5,
	call_now = false,
	autostart = true,
	callback = check_updates,
})

return create_torrents_widget
