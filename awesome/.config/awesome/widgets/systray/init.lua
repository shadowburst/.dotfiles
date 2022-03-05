local awful = require('awful')
local beautiful = require('beautiful')
local wibox = require('wibox')

local icons = require('theme.icons').systray
local widget_container = require('widgets.containers.widget-container')

local create_systray_widget = function()
	local properties = {
		visible = false,
	}

	local systray_widget = wibox.widget({
		widget = wibox.container.margin,
		right = beautiful.icon_spacing,
		{
			visible = true,
			horizontal = true,
			reverse = true,
			widget = wibox.widget.systray,
		},
	})

	local toggle_button = wibox.widget({
		text = icons.open,
		font = beautiful.nerd_font .. ' 18',
		widget = wibox.widget.textbox,
		buttons = {
			awful.button({}, 1, function()
				properties.visible = not properties.visible
				awesome.emit_signal('widgets::systray')
			end),
		},
	})

	local systray_container_widget = widget_container({
		id = 'systray_layout',
		layout = wibox.layout.fixed.horizontal,
		spacing = 0,
		toggle_button,
	}, {}, true)

	awesome.connect_signal('widgets::systray', function()
		local systray_layout = systray_container_widget:get_children_by_id('systray_layout')[1]
		local systray_index = systray_layout:index(systray_widget)

		if properties.visible then
			if not systray_index then
				systray_layout:insert(1, systray_widget)
			end
		else
			if systray_index then
				systray_layout:remove(systray_index)
			end
		end
		toggle_button:set_text(properties.visible and icons.close or icons.open)
	end)

	systray_container_widget:connect_signal('mouse::enter', function()
		properties.visible = true
		awesome.emit_signal('widgets::systray')
	end)

	systray_container_widget:connect_signal('mouse::leave', function()
		properties.visible = false
		awesome.emit_signal('widgets::systray')
	end)

	return systray_container_widget
end

return create_systray_widget
