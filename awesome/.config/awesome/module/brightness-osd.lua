local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local dpi = beautiful.xresources.apply_dpi

local osd_header = wibox.widget({
	text = 'Brightness',
	font = beautiful.base_font .. ' 12',
	align = 'left',
	valign = 'center',
	widget = wibox.widget.textbox
})

local osd_value = wibox.widget({
	text = '0%',
	font = beautiful.base_font .. ' 12',
	align = 'center',
	valign = 'center',
	widget = wibox.widget.textbox
})

local slider_osd = wibox.widget({
	{
		id 					= 'bri_osd_slider',
		bar_shape           = gears.shape.rounded_rect,
		bar_height          = dpi(24),
		bar_color           = beautiful.highlight,
		bar_active_color	= beautiful.primary,
		handle_color        = beautiful.foreground,
		handle_shape        = gears.shape.circle,
		handle_width        = dpi(24),
		handle_border_width = dpi(1),
		maximum				= 100,
		widget              = wibox.widget.slider
	},
	expand = 'none',
	layout = wibox.layout.align.vertical
})

local bri_osd_slider = slider_osd.bri_osd_slider

bri_osd_slider:connect_signal(
	'property::value',
	function()
		local brightness_level = bri_osd_slider:get_value()

		awful.spawn.easy_async_with_shell(
			'qdbus org.kde.Solid.PowerManagement /org/kde/Solid/PowerManagement/Actions/BrightnessControl ' ..
			'org.kde.Solid.PowerManagement.Actions.BrightnessControl.setBrightness ' .. brightness_level * 960,
			function()
				-- Update textbox widget text
				osd_value.text = brightness_level .. '%'

				-- Update the brightness slider if values here change
				bri_osd_slider:set_value(brightness_level)

				if awful.screen.focused().show_bri_osd then
					awesome.emit_signal(
						'module::brightness_osd:show',
						true
					)
				end
			end
		)
	end
)

bri_osd_slider:connect_signal(
	'button::press',
	function()
		awful.screen.focused().show_bri_osd = true
	end
)

bri_osd_slider:connect_signal(
	'mouse::enter',
	function()
		awful.screen.focused().show_bri_osd = true
	end
)

-- The emit will come from brightness slider
awesome.connect_signal(
	'module::brightness_osd',
	function(brightness)
		bri_osd_slider:set_value(brightness)
	end
)

local icon = wibox.widget {
	{
		text = '',
		font = beautiful.nerd_font .. ' 140',
		widget = wibox.widget.textbox
	},
	forced_height = dpi(150),
	top = dpi(12),
	bottom = dpi(12),
	widget = wibox.container.margin
}

local osd_height = dpi(250)
local osd_width = dpi(250)
local osd_margin = dpi(10)

screen.connect_signal(
	'request::desktop_decoration',
	function(s)
		local s = s or {}
		s.show_bri_osd = false

		s.brightness_osd_overlay = awful.popup {
			widget = {
			  -- Removing this block will cause an error...
			},
			ontop = true,
			visible = false,
			type = 'notification',
			screen = s,
			height = osd_height,
			width = osd_width,
			maximum_height = osd_height,
			maximum_width = osd_width,
			offset = dpi(5),
			shape = gears.shape.rectangle,
			bg = beautiful.transparent,
			preferred_anchors = 'middle',
			preferred_positions = {'left', 'right', 'top', 'bottom'}
		}

		s.brightness_osd_overlay:setup({
			{
				{
					layout = wibox.layout.fixed.vertical,
					{
						{
							layout = wibox.layout.align.horizontal,
							expand = 'none',
							nil,
							icon,
							nil
						},
						{
							layout = wibox.layout.fixed.vertical,
							spacing = dpi(5),
							{
								layout = wibox.layout.align.horizontal,
								expand = 'none',
								osd_header,
								nil,
								osd_value
							},
							slider_osd
						},
						spacing = dpi(10),
						layout = wibox.layout.fixed.vertical
					},
				},
				left = dpi(24),
				right = dpi(24),
				widget = wibox.container.margin
			},
			bg = beautiful.background,
			shape = gears.shape.rounded_rect,
			widget = wibox.container.background
		})

		-- Reset timer on mouse hover
		s.brightness_osd_overlay:connect_signal(
			'mouse::enter',
			function()
				s.show_bri_osd = true
				awesome.emit_signal('module::brightness_osd:rerun')
			end
		)
	end
)

local hide_osd = gears.timer {
	timeout = 2,
	autostart = true,
	callback  = function()
		local focused = awful.screen.focused()
		focused.brightness_osd_overlay.visible = false
		focused.show_bri_osd = false
	end
}

awesome.connect_signal(
	'module::brightness_osd:rerun',
	function()
		if hide_osd.started then
			hide_osd:again()
		else
			hide_osd:start()
		end
	end
)

local placement_placer = function()
	local focused = awful.screen.focused()
	local brightness_osd = focused.brightness_osd_overlay
	awful.placement.align(
		brightness_osd,
		{
			position = 'bottom',
			offset = { x = 0, y = dpi(-100)}
		}
	)
end

awesome.connect_signal(
	'module::brightness_osd:show',
	function(bool)
		placement_placer()
		awful.screen.focused().brightness_osd_overlay.visible = bool
		if bool then
			awesome.emit_signal('module::brightness_osd:rerun')
			awesome.emit_signal(
				'module::volume_osd:show',
				false
			)
		else
			if hide_osd.started then
				hide_osd:stop()
			end
		end
	end
)