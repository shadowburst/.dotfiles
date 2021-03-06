local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local menubar = require('menubar')
local naughty = require('naughty')
local ruled = require('ruled')
local wibox = require('wibox')

local dpi = beautiful.xresources.apply_dpi
local clickable_container = require('widgets.containers.clickable-container')

-- Defaults
naughty.config.defaults.ontop = true
naughty.config.defaults.icon_size = beautiful.notification_icon_size
naughty.config.defaults.timeout = 5
naughty.config.defaults.title = 'System Notification'
naughty.config.defaults.margin = beautiful.notification_margin
naughty.config.defaults.border_width = beautiful.notification_border_width
naughty.config.defaults.position = beautiful.notification_position
naughty.config.defaults.shape = beautiful.notification_shape

ruled.notification.connect_signal('request::rules', function()
	ruled.notification.append_rule({
		rule = { urgency = 'critical' },
		properties = {
			bg = beautiful.dark_red,
			implicit_timeout = 0,
		},
	})
	ruled.notification.append_rule({
		except = { urgency = 'critical' },
		properties = {
			implicit_timeout = 5,
		},
	})
end)
-- Apply theme variables
naughty.config.padding = dpi(8)
naughty.config.spacing = dpi(8)
naughty.config.icon_dirs = {
	'/usr/share/icons/Tela',
	'/usr/share/icons/Tela-blue-dark',
	'/usr/share/icons/Papirus/',
	'/usr/share/icons/gnome/',
	'/usr/share/icons/hicolor/',
	'/usr/share/pixmaps/',
}
naughty.config.icon_formats = { 'svg', 'png', 'jpg', 'gif' }

-- Error handling
naughty.connect_signal('request::display_error', function(message, startup)
	naughty.notification({
		urgency = 'critical',
		title = 'Oops, an error happened' .. (startup and ' during startup!' or '!'),
		message = message,
		app_name = 'System Notification',
		icon = beautiful.awesome_icon,
	})
end)

-- XDG icon lookup
naughty.connect_signal('request::icon', function(n, context, hints)
	if context ~= 'app_icon' then
		return
	end

	local path = menubar.utils.lookup_icon(hints.app_icon) or menubar.utils.lookup_icon(hints.app_icon:lower())

	if path then
		n.icon = path
	end
end)

-- Connect to naughty on display signal
naughty.connect_signal('request::display', function(n)
	-- Actions Blueprint
	local actions_template = wibox.widget({
		notification = n,
		base_layout = wibox.widget({
			spacing = dpi(0),
			layout = wibox.layout.flex.horizontal,
		}),
		widget_template = {
			{
				{
					{
						{
							id = 'text_role',
							widget = wibox.widget.textbox,
						},
						widget = wibox.container.place,
					},
					widget = clickable_container,
				},
				bg = beautiful.groups_bg,
				shape = gears.shape.rounded_rect,
				forced_height = dpi(30),
				widget = wibox.container.background,
			},
			margins = dpi(4),
			widget = wibox.container.margin,
		},
		style = { underline_normal = false, underline_selected = true },
		widget = naughty.list.actions,
	})

	-- Notifbox Blueprint
	naughty.layout.box({
		notification = n,
		type = 'notification',
		screen = awful.screen.preferred(),
		shape = gears.shape.rectangle,
		widget_template = {
			{
				{
					{
						{
							{
								{
									{
										{
											{
												{
													markup = n.app_name or 'System Notification',
													align = 'center',
													valign = 'center',
													widget = wibox.widget.textbox,
												},
												margins = beautiful.notification_margin,
												widget = wibox.container.margin,
											},
											bg = beautiful.background,
											widget = wibox.container.background,
										},
										{
											{
												{
													resize_strategy = 'center',
													widget = naughty.widget.icon,
												},
												margins = beautiful.notification_margin,
												widget = wibox.container.margin,
											},
											{
												{
													layout = wibox.layout.align.vertical,
													expand = 'none',
													nil,
													{
														{
															align = 'left',
															widget = naughty.widget.title,
														},
														{
															align = 'left',
															widget = naughty.widget.message,
														},
														layout = wibox.layout.fixed.vertical,
													},
													nil,
												},
												margins = beautiful.notification_margin,
												widget = wibox.container.margin,
											},
											layout = wibox.layout.fixed.horizontal,
										},
										fill_space = true,
										spacing = beautiful.notification_margin,
										layout = wibox.layout.fixed.vertical,
									},
									-- Margin between the fake background
									-- Set to 0 to preserve the 'titlebar' effect
									margins = dpi(0),
									widget = wibox.container.margin,
								},
								bg = beautiful.transparent,
								widget = wibox.container.background,
							},
							-- Actions
							actions_template,
							spacing = dpi(4),
							layout = wibox.layout.fixed.vertical,
						},
						bg = beautiful.transparent,
						id = 'background_role',
						widget = naughty.container.background,
					},
					strategy = 'min',
					width = dpi(400),
					widget = wibox.container.constraint,
				},
				strategy = 'max',
				width = beautiful.notification_max_width or dpi(400),
				widget = wibox.container.constraint,
			},
			bg = beautiful.background,
			shape = gears.shape.rounded_rect,
			widget = wibox.container.background,
		},
	})

	-- Destroy popups if dont_disturb mode is on
	-- Or if the right_panel is visible
	local focused = awful.screen.focused()
	if _G.dont_disturb or (focused.right_panel and focused.right_panel.visible) then
		naughty.destroy_all_notifications(nil, 1)
	end
end)
