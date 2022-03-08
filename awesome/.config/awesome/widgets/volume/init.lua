local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local icons = require('theme.icons')
local helpers = require('helpers')
local widget_container = require('widgets.containers.widget-container')

local properties = {
	mute = true,
	volume = 0,
}

local check_updates = function()
	local args = {
		mute = true,
		volume = 0,
	}

	awful.spawn.easy_async('amixer -D pulse sget Master', function(stdout)
		args.volume = tonumber(string.match(stdout, '(%d?%d?%d)%%'))
		args.mute = stdout:match('off')

		if args.mute == properties.mute and args.volume == properties.volume then
			return
		end

		awesome.emit_signal('widgets::volume', args)
	end)
end

local create_volume_widget = function()
	local percentage_widget = wibox.widget({
		text = '0%',
		widget = wibox.widget.textbox,
	})

	local buttons = {
		awful.button({}, 1, function()
			awful.spawn('pavucontrol')
		end),
		awful.button({}, 3, function()
			awesome.emit_signal('widgets::volume::mute::toggle')
		end),
		awful.button({}, 4, function()
			awesome.emit_signal('widgets::volume::increment')
		end),
		awful.button({}, 5, function()
			awesome.emit_signal('widgets::volume::decrement')
		end),
	}

	local volume_widget = widget_container({
		{
			id = 'icon',
			markup = helpers.colorize_text(icons.volume_off, beautiful.disabled),
			font = beautiful.nerd_font .. ' 20',
			widget = wibox.widget.textbox,
		},
		id = 'volume_layout',
		spacing = beautiful.icon_spacing,
		layout = wibox.layout.fixed.horizontal,
	}, buttons, true)

	awesome.connect_signal('widgets::volume', function(args)
		properties = args or properties

		local icon = properties.mute and icons.volume_off or icons.volume_on
		local color = properties.mute and beautiful.disabled or beautiful.primary

		volume_widget:get_children_by_id('icon')[1]:set_markup(helpers.colorize_text(icon, color))
		percentage_widget:set_text(properties.volume .. '%')

		local volume_layout = volume_widget:get_children_by_id('volume_layout')[1]
		local percentage_index = volume_layout:index(percentage_widget)

		if properties.mute then
			if percentage_index then
				volume_layout:remove(percentage_index)
			end
		else
			if not percentage_index then
				volume_layout:add(percentage_widget)
			end
		end
	end)

	check_updates()

	return volume_widget
end

awesome.connect_signal('widgets::volume::decrement', function()
	properties.volume = math.max(0, properties.volume - 5)

	if properties.mute then
		properties.mute = false

		awful.spawn.easy_async('amixer -D pulse set Master 1+ on', function() end)
	end

	awful.spawn.easy_async('amixer -D pulse sset Master ' .. properties.volume .. '%', function()
		awesome.emit_signal('widgets::volume')
		awesome.emit_signal('module::volume_osd', properties)
		awesome.emit_signal('module::volume_osd:show', true)
	end)
end)

awesome.connect_signal('widgets::volume::increment', function()
	properties.volume = math.min(100, properties.volume + 5)

	if properties.mute then
		properties.mute = false

		awful.spawn.easy_async('amixer -D pulse set Master 1+ on', function() end)
	end

	awful.spawn.easy_async('amixer -D pulse sset Master ' .. properties.volume .. '%', function()
		awesome.emit_signal('widgets::volume')
		awesome.emit_signal('module::volume_osd', properties)
		awesome.emit_signal('module::volume_osd:show', true)
	end)
end)

awesome.connect_signal('widgets::volume::mute::toggle', function()
	properties.mute = not properties.mute

	awful.spawn.easy_async('amixer -D pulse set Master 1+ ' .. (properties.mute and 'off' or 'on'), function()
		awesome.emit_signal('widgets::volume')
		awesome.emit_signal('module::volume_osd', properties)
		awesome.emit_signal('module::volume_osd:show', true)
	end)
end)

gears.timer({
	timeout = 5,
	call_now = false,
	autostart = true,
	callback = check_updates,
})

return create_volume_widget
