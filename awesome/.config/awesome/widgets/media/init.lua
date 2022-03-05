local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local env = require('env')
local icons = require('theme.icons').media
local widget_container = require('widgets.containers.widget-container')

local dpi = beautiful.xresources.apply_dpi

local properties = {
	visible = true,
	playing = false,
	title = '',
}

local check_updates = function()
	local args = {
		visible = true,
		playing = false,
		title = '',
	}

	awful.spawn.easy_async('playerctl status', function(status)
		args.playing = status:match('Playing')
		args.visible = env.debug or args.playing or status:match('Paused')

		if not args.visible then
			awesome.emit_signal('widgets::media', args)
			return
		end

		awful.spawn.easy_async(
			[[ bash -c "playerctl metadata | grep title | awk -F 'title' '{print(\$2)}'" ]],
			function(metadata)
				args.title = metadata:gsub('^%s*(.-)%s*$', '%1')

				if args.playing == properties.playing and args.title == properties.title then
					return
				end

				awesome.emit_signal('widgets::media', args)
			end
		)
	end)
end

local create_media_widget = function()
	local previous_button_widget = widget_container({
		id = 'previous',
		widget = wibox.widget.textbox,
		text = icons.previous,
		font = beautiful.nerd_font .. ' 16',
	}, {
		awful.button({}, 1, function()
			awful.spawn.easy_async_with_shell('playerctl previous', function() end)
		end),
	})

	local play_button_widget = widget_container({
		id = 'play',
		widget = wibox.widget.textbox,
		text = icons.pause,
		font = beautiful.nerd_font .. ' 16',
	}, {
		awful.button({}, 1, function()
			awful.spawn.easy_async_with_shell('playerctl play-pause', function()
				properties.playing = not properties.playing
				awesome.emit_signal('widgets::media')
			end)
		end),
	})

	local next_button_widget = widget_container({
		id = 'next',
		widget = wibox.widget.textbox,
		text = icons.next,
		font = beautiful.nerd_font .. ' 16',
	}, {
		awful.button({}, 1, function()
			awful.spawn.easy_async_with_shell('playerctl next', function() end)
		end),
	})

	local media_widget = wibox.widget({
		widget = wibox.container.margin,
		left = beautiful.widget_spacing,
		right = beautiful.widget_spacing,
		{
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
					left = dpi(5),
					right = dpi(10),
					{
						id = 'title_scroll',
						widget = wibox.container.scroll.horizontal,
						fps = 20,
						speed = 20,
						max_size = dpi(200),
						{
							id = 'title',
							widget = wibox.widget.textbox,
							text = '',
						},
					},
				},
			},
		},
	})

	awesome.connect_signal('widgets::media', function(args)
		properties = args or properties

		media_widget:set_visible(properties.visible)
		if not properties.visible then
			return
		end

		media_widget:get_children_by_id('title')[1]:set_text('   ' .. properties.title .. '   ')
		play_button_widget:get_children_by_id('play')[1]:set_text(properties.playing and icons.pause or icons.play)

		local scroll = media_widget:get_children_by_id('title_scroll')[1]
		if properties.playing then
			scroll:continue()
		else
			scroll:pause()
			scroll:reset_scrolling()
		end
	end)

	check_updates()

	return media_widget
end

gears.timer({
	timeout = 5,
	call_now = false,
	autostart = true,
	callback = check_updates,
})

return create_media_widget
