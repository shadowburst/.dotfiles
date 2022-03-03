local awful = require('awful')
local beautiful = require('beautiful')

local apps = require('configuration.apps')
local icons = require('theme.icons').tags

local default_layout = awful.layout.suit.tile

local tags = {
	{
		name = icons.chrome,
		type = 'internet',
		default_app = apps.browser,
		matches = {
			'firefox',
			'brave-browser',
		},
	},
	{
		name = icons.code,
		type = 'code',
		default_app = apps.editor,
		matches = {
			'Code',
			'nvim',
			'jetbrains-studio',
		},
	},
	{
		name = icons.chat,
		type = 'social',
		default_app = 'ferdi',
		matches = {
			'discord',
			'Ferdi',
			'slack',
		},
	},
	{
		name = icons.files,
		type = 'files',
		default_app = apps.file_manager,
		matches = {
			'dolphin',
			'Nautilus',
			'Thunar',
			'ranger',
			'DesktopEditors',
		},
	},
	{
		name = icons.games,
		type = 'games',
		default_app = 'lutris',
		matches = {
			'lutris',
			'Steam',
		},
	},
	{
		name = icons.media,
		type = 'media',
		default_app = 'gimp',
		matches = {
			'Gimp',
			'kdenlive',
		},
	},
	{
		name = icons.terminal,
		type = 'terminal',
		default_app = apps.terminal,
		matches = {
			'Virt-manager',
		},
	},
}

tag.connect_signal('request::default_layouts', function()
	awful.layout.append_default_layouts({
		-- awful.layout.suit.floating,
		awful.layout.suit.tile,
		-- awful.layout.suit.tile.left,
		-- awful.layout.suit.tile.right,
		-- awful.layout.suit.tile.bottom,
		-- awful.layout.suit.tile.top,
		-- awful.layout.suit.fair,
		-- awful.layout.suit.fair.horizontal,
		-- awful.layout.suit.spiral,
		-- awful.layout.suit.spiral.dwindle,
		-- awful.layout.suit.max,
		awful.layout.suit.max.fullscreen,
		-- awful.layout.suit.magnifier,
		-- awful.layout.suit.corner.nw,
	})
end)

screen.connect_signal('request::desktop_decoration', function(s)
	for i, tag in pairs(tags) do
		awful.tag.add(tag.name, {
			screen = s,
			selected = i == 1,
			layout = default_layout,
			gap_single_client = true,
			default_app = tag.default_app,
		})
	end
end)

local update_gap_and_shape = function(t)
	-- Get current tag layout
	local current_layout = awful.tag.getproperty(t, 'layout')
	-- If the current layout is awful.layout.suit.max
	if current_layout == awful.layout.suit.max or current_layout == awful.layout.suit.max.fullscreen then
		-- Set clients gap to 0 and shape to rectangle if maximized
		t.gap = 0
		for _, c in ipairs(t:clients()) do
			if not c.floating or not c.round_corners or c.maximized or c.fullscreen then
				c.shape = beautiful.rect
				c.border_width = 0
			else
				c.shape = beautiful.rounded_rect
				c.border_width = beautiful.border_width
			end
		end
	else
		t.gap = beautiful.useless_gap
		for _, c in ipairs(t:clients()) do
			if not c.round_corners or c.maximized or c.fullscreen then
				c.shape = beautiful.rect
				c.border_width = 4
			else
				c.shape = beautiful.rounded_rect
				c.border_width = beautiful.border_width
			end
		end
	end
end

-- Change tag's client's shape and gap on change
tag.connect_signal('property::layout', function(t)
	update_gap_and_shape(t)
end)

-- Change tag's client's shape and gap on tagged
tag.connect_signal('tagged', function(t)
	update_gap_and_shape(t)
end)

return tags
