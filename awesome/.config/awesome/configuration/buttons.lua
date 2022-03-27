local awful = require('awful')
local modkey = require('configuration.keybindings').modkey

local global_buttons = awful.util.table.join(
	awful.button({}, 1, function() end),
	awful.button({}, 2, function() end),
	awful.button({}, 3, function() end),
	awful.button({ modkey }, 4, awful.tag.viewprev),
	awful.button({ modkey }, 5, awful.tag.viewnext)
)

local client_buttons = awful.util.table.join(
	awful.button({}, 1, function(c)
		c:emit_signal('request::activate')
		c:raise()
	end),
	awful.button({ modkey }, 1, awful.mouse.client.move),
	awful.button({ modkey }, 3, awful.mouse.client.resize),
	awful.button({ modkey }, 4, function(c)
		awful.tag.viewprev()
	end),
	awful.button({ modkey }, 5, function(c)
		awful.tag.viewnext()
	end)
)

root.buttons(global_buttons)

return {
	global_buttons = global_buttons,
	client_buttons = client_buttons,
}
