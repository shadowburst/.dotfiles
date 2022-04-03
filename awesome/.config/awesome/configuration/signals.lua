local awful = require('awful')

-- Signal function to execute when a new client appears.
client.connect_signal('manage', function(c)
	-- Focus, raise and activate
	c:emit_signal('request::activate', 'mouse_enter', {
		raise = true,
	})

	-- Set the windows at the slave,
	-- i.e. put it at the end of others instead of setting it master.
	if not awesome.startup then
		awful.client.setslave(c)
	end

	if awesome.startup and not c.size_hints.user_position and not c.size_hints.program_position then
		-- Prevent clients from being unreachable after screen count changes.
		awful.placement.no_offscreen(c)
	end
end)

-- Enable sloppy focus, so that focus follows mouse then raises it.
client.connect_signal('mouse::enter', function(c)
	c:emit_signal('request::activate', 'mouse_enter', {
		raise = true,
	})
end)

client.connect_signal('property::floating', function(c)
	c.ontop = c.floating
end)
