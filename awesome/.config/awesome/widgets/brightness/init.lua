local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local icons = require('theme.icons')
local helpers = require('helpers')
local widget_container = require('widgets.containers.widget-container')

local properties = {
	brightness = 0,
}

local check_updates = function()
	local args = {
		brightness = 0,
	}

	awful.spawn.easy_async('light -G', function(brightness)
		args.brightness = math.floor(tonumber(brightness))

		if args.brightness == properties.brightness then
			return
		end

		awesome.emit_signal('widgets::brightness', args)
	end)
end

local create_brightness_widget = function()
	local buttons = {
		awful.button({}, 4, function()
			awesome.emit_signal('widgets::brightness::increment')
		end),
		awful.button({}, 5, function()
			awesome.emit_signal('widgets::brightness::decrement')
		end),
	}

	local brightness_widget = widget_container({
		layout = wibox.layout.fixed.horizontal,
		spacing = beautiful.icon_spacing,
		{
			markup = helpers.colorize_text(icons.brightness, beautiful.primary),
			font = beautiful.nerd_font .. ' 20',
			widget = wibox.widget.textbox,
		},
		{
			id = 'percentage',
			text = properties.brightness .. '%',
			widget = wibox.widget.textbox,
		},
	}, buttons, true)

	awesome.connect_signal('widgets::brightness', function(args)
		properties = args or properties

		brightness_widget:get_children_by_id('percentage')[1]:set_text(properties.brightness .. '%')
	end)

	check_updates()

	return brightness_widget
end

awesome.connect_signal('widgets::brightness::decrement', function()
	properties.brightness = math.max(5, properties.brightness - 5)

	awful.spawn.easy_async('light -S ' .. properties.brightness, function()
		awesome.emit_signal('widgets::brightness')
		awesome.emit_signal('module::brightness_osd', properties)
		awesome.emit_signal('module::brightness_osd:show', true)
	end)
end)

awesome.connect_signal('widgets::brightness::increment', function()
	properties.brightness = math.min(100, properties.brightness + 5)

	awful.spawn.easy_async('light -S ' .. properties.brightness, function()
		awesome.emit_signal('widgets::brightness')
		awesome.emit_signal('module::brightness_osd', properties)
		awesome.emit_signal('module::brightness_osd:show', true)
	end)
end)

gears.timer({
	timeout = 60,
	call_now = false,
	autostart = true,
	callback = check_updates,
})

return create_brightness_widget
