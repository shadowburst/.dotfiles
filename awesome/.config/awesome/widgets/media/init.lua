local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local env = require('env')
local icons = require('theme.icons').media
local widget_container = require('widgets.containers.widget-container')

local dpi = beautiful.xresources.apply_dpi

local create_media_widget = function()
	local previous_button_widget = widget_container(
		{
			id = 'previous',
			widget = wibox.widget.textbox,
			text = icons.previous,
			font = beautiful.nerd_font .. ' 16',
		},
		awful.util.table.join(awful.button({}, 1, function()
			awful.spawn.easy_async_with_shell('playerctl previous', function()
				awesome.emit_signal('widgets::media')
			end)
		end))
	)

	local play_button_widget = widget_container(
		{
			id = 'play',
			widget = wibox.widget.textbox,
			text = icons.pause,
			font = beautiful.nerd_font .. ' 16',
		},
		awful.util.table.join(awful.button({}, 1, function()
			awful.spawn.easy_async_with_shell('playerctl play-pause', function()
				awesome.emit_signal('widgets::media')
			end)
		end))
	)

	local next_button_widget = widget_container(
		{
			id = 'next',
			widget = wibox.widget.textbox,
			text = icons.next,
			font = beautiful.nerd_font .. ' 16',
		},
		awful.util.table.join(awful.button({}, 1, function()
			awful.spawn.easy_async_with_shell('playerctl next', function()
				awesome.emit_signal('widgets::media')
			end)
		end))
	)

	local media_widget = wibox.widget({
		widget = wibox.container.background,
		shape = gears.shape.rounded_rect,
		bg = beautiful.background,
		{
			layout = wibox.layout.fixed.horizontal,
			previous_button_widget,
			play_button_widget,
			next_button_widget,
			{
				widget = wibox.container.margin,
				left = beautiful.widget_spacing,
				right = beautiful.widget_spacing * 2,
				{
					widget = wibox.container.constraint,
					width = dpi(200),
					{
						id = 'title',
						widget = wibox.widget.textbox,
						text = '',
					},
				},
			},
		},
	})

	awesome.connect_signal('widgets::media', function()
		awful.spawn.easy_async_with_shell('playerctl status', function(status_stdout)
			local visible = env.debug or status_stdout:match('Playing') or status_stdout:match('Paused')
			local playing = status_stdout:match('Playing')

			if media_widget.visible ~= visible then
				media_widget:set_visible(visible)
			end
			if not visible then
				return
			end

			awful.spawn.easy_async_with_shell(
				[[ bash -c "playerctl metadata | grep title | awk -F 'title' '{print(\$2)}'" ]],
				function(metadata_stdout)
					local title = metadata_stdout:gsub('^%s*(.-)%s*$', '%1')
					media_widget:get_children_by_id('title')[1]:set_text(title)
					play_button_widget:get_children_by_id('play')[1]:set_text(playing and icons.pause or icons.play)
				end
			)
		end)
	end)

	gears.timer({
		timeout = 5,
		call_now = true,
		autostart = true,
		callback = function()
			awesome.emit_signal('widgets::media')
		end,
	})

	return media_widget
end

return create_media_widget
