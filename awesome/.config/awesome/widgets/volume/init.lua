local awful = require('awful')
local beautiful = require('beautiful')
local wibox = require('wibox')

local widget_container = require('widgets.containers.widget-container')

local icons = beautiful.icons.volume
local watch = awful.widget.watch

local create_volume_widget = function()

	local properties = {
		volume = 0,
		muted = false,
		disabled = false
	}

	local icon_markup = function(mute)
		local color = mute and beautiful.disabled or beautiful.primary
		local icon = mute and icons.off or icons.on
		return '<span color="' .. color .. '">' .. icon .. '</span>'
	end

	local percentage_widget = wibox.widget({
		text = '0%',
		widget = wibox.widget.textbox
	})

	local buttons = awful.util.table.join(
		awful.button(
			{}, 1,
			function()
				awful.spawn('pavucontrol')
			end
		),
		awful.button(
			{}, 3,
			function()
				awesome.emit_signal('widgets::volume', { toggle_mute = true })
			end
		)
	)

	local volume_widget = widget_container(
		{
			{
				id = 'icon',
				markup = icon_markup(true),
				font = beautiful.nerd_font .. ' 18',
				widget = wibox.widget.textbox
			},
			id = 'volume_layout',
			spacing = beautiful.widget_spacing,
			layout = wibox.layout.fixed.horizontal
		},
		buttons
	)

	local update_widget = function(args)
		local volume_layout = volume_widget:get_children_by_id('volume_layout')[1]
		local percentage_index = volume_layout:index(percentage_widget)

		if args.mute then
			if percentage_index then
				volume_layout:remove(percentage_index)
			end
		else
			if not percentage_index then
				volume_layout:add(percentage_widget)
			end
			percentage_widget:set_text(args.volume .. '%')
		end

		volume_widget:get_children_by_id('icon')[1]:set_markup(icon_markup(args.mute))
	end

	local on_volume_change = function (args)
		update_widget(args)
		awesome.emit_signal('module::volume_osd', args)
		awesome.emit_signal('module::volume_osd:show', true)
	end

	awesome.connect_signal(
		'widgets::volume',
		function(args)
			awful.spawn.easy_async_with_shell(
                'amixer -D pulse sget Master',
                function(stdout)
                    local volume = args.volume or (tonumber(string.match(stdout, '(%d?%d?%d)%%')) + (args.diff or 0))
					local new_args = {
						volume = math.max(math.min(volume, 100), 0),
						mute = stdout:match('off')
					}

                    awful.spawn.easy_async_with_shell(
						'amixer -D pulse sset Master ' .. volume .. '%',
						function()
							if args.toggle_mute then
								awful.spawn.easy_async_with_shell(
									'amixer -D pulse set Master 1+ toggle',
									function()
										new_args.mute = not new_args.mute
										on_volume_change(new_args)
									end
								)
							else
								if args.diff then
									awful.spawn.easy_async_with_shell(
										'amixer -D pulse set Master 1+ on',
										function()
											new_args.mute = false
											on_volume_change(new_args)
										end
									)
								else
									awful.spawn.easy_async_with_shell(
										'amixer -D pulse set Master 1+ ' .. args.mute and 'off' or 'on',
										function()
											new_args.mute = args.mute
											on_volume_change(new_args)
										end
									)
								end
							end
						end
					)
                end
            )
		end
	)

	watch(
		'amixer -D pulse sget Master',
		1,
		function(_, stdout)
			update_widget({
				volume = tonumber(stdout:match('(%d?%d?%d)%%')),
				mute = stdout:match('off')
			})
		end
	)

	return volume_widget
end

return create_volume_widget()