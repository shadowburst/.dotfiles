local top_panel = require('layout.top-panel')

-- Create a wibox panel for each screen and add it
screen.connect_signal(
	'request::desktop_decoration',
	function(s)
		s.top_panel = top_panel(s)
	end
)

screen.connect_signal(
	'primary_changed',
	function(s)
		for _, c in ipairs(client.get()) do
			c:move_to_screen(s.index)
		end
	end
)

screen.connect_signal(
	'added',
	awesome.restart
)

screen.connect_signal(
	'removed',
	awesome.restart
)

-- Hide bars when app go fullscreen
local update_bars_visibility = function()
	for s in screen do
		if s.selected_tag and s.top_panel then
			local fullscreen = s.selected_tag.fullscreen_mode
			-- Order matter here for shadow
			s.top_panel.visible = not fullscreen
		end
	end
end

tag.connect_signal(
	'property::selected',
	function(t)
		update_bars_visibility()
	end
)

client.connect_signal(
	'property::fullscreen',
	function(c)
		if c.first_tag then
			c.first_tag.fullscreen_mode = c.fullscreen
		end
		update_bars_visibility()
	end
)

client.connect_signal(
	'request::unmanage',
	function(c)
		if c.fullscreen then
			c.screen.selected_tag.fullscreen_mode = false
			update_bars_visibility()
		end
	end
)
