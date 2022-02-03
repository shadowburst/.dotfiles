local awful = require('awful')
local beautiful = require('beautiful')

local update_client = function(c)
	-- Set client's shape based on its tag's layout and status (floating, maximized, etc.)
	local current_layout = awful.tag.getproperty(c.first_tag, 'layout')
	if current_layout == awful.layout.suit.max and (not c.floating) then
		c.shape = beautiful.rect
	elseif c.maximized or c.fullscreen then
		c.shape = beautiful.rect
	elseif (not c.round_corners) then
		c.shape = beautiful.rect
	else
		if c.class == 'Rofi' then
			c.shape = beautiful.partially_rounded_rect
		else
			c.shape = beautiful.rounded_rect
		end
	end
end

-- Signal function to execute when a new client appears.
client.connect_signal(
	'manage',
	function(c)
		-- Focus, raise and activate
		c:emit_signal(
			'request::activate',
			'mouse_enter',
			{
				raise = true
			}
		)

		-- Set the windows at the slave,
		-- i.e. put it at the end of others instead of setting it master.
		if not awesome.startup then
			awful.client.setslave(c)
		end

		if awesome.startup and not c.size_hints.user_position and
			not c.size_hints.program_position then
			-- Prevent clients from being unreachable after screen count changes.
			awful.placement.no_offscreen(c)
		end

		-- Update client shape
		update_client(c)
	end
)

client.connect_signal(
	'unfocus',
	function(c)
		if c.class == 'Rofi' then
			c:kill()
		end
	end
)

-- Enable sloppy focus, so that focus follows mouse then raises it.
client.connect_signal(
	'mouse::enter',
	function(c)
		c:emit_signal(
			'request::activate',
			'mouse_enter',
			{
				raise = true
			}
		)
	end
)

-- Manipulate client shape on fullscreen/non-fullscreen
client.connect_signal(
	'property::fullscreen',
	function(c)
		if c.fullscreen then
			c.shape = beautiful.rect
		else
			update_client(c)
		end
	end
)
