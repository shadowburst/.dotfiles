local awful = require('awful')
local hotkeys_popup = require('awful.hotkeys_popup').widget

local apps = require('configuration.apps')
local scripts = require('scripts')
local tags = require('configuration.tags')

local altkey = 'Mod1'
local modkey = 'Mod4'

local global_keys = awful.util.table.join(
	--#region Awesome
	awful.key({ modkey }, 'F1', hotkeys_popup.show_help, { group = 'Awesome', description = 'Show help' }),

	awful.key({ modkey, 'Control' }, 'r', awesome.restart, { group = 'Awesome', description = 'Reload awesome' }),

	awful.key({ altkey, 'Control' }, 'Delete', function()
		awful.spawn.easy_async_with_shell('xkill', function() end)
	end, { group = 'Awesome', description = 'Kill a client' }),

	awful.key({ modkey }, 'x', function()
		local focused = awful.screen.focused()
		awesome.emit_signal(focused.exit_screen.visible and 'module::exit_screen:hide' or 'module::exit_screen:show')
	end, { group = 'Awesome', description = 'Toggle exit screen' }),

	awful.key({ modkey }, 'space', function()
		awful.spawn.easy_async_with_shell(scripts.app_menu, function() end)
	end, { group = 'Awesome', description = 'Toggle app menu' }),
	--#endregion

	--#region Screens
	awful.key({ modkey, 'Control' }, 'h', function()
		awful.screen.focus_relative(-1)
	end, { group = 'Screens', description = 'Focus the previous/next screen' }),

	awful.key({ modkey, 'Control' }, 'l', function()
		awful.screen.focus_relative(1)
	end, { group = 'Screens', description = 'Focus the previous/next screen' }),
	--#endregion

	--#region Tags
	awful.key({ modkey }, 'h', awful.tag.viewprev, { group = 'Tags', description = 'View previous/next tag' }),

	awful.key({ modkey }, 'l', awful.tag.viewnext, { group = 'Tags', description = 'View previous/next tag' }),
	--#endregion

	--#region Clients
	awful.key({ modkey }, 'j', function()
		awful.client.focus.byidx(-1)
	end, { group = 'Clients', description = 'Focus previous/next client' }),

	awful.key({ modkey }, 'k', function()
		awful.client.focus.byidx(1)
	end, { group = 'Clients', description = 'Focus previous/next client' }),
	--#endregion

	--#region Layouts
	awful.key({ modkey }, 'f', function()
		awful.layout.inc(1)
	end, { group = 'Layouts', description = 'Select next layout' }),

	awful.key({ modkey }, 'Left', function()
		awful.tag.incncol(-1, nil, true)
	end, { group = 'Layouts', description = 'Decrease/increase the number of columns' }),

	awful.key({ modkey }, 'Right', function()
		awful.tag.incncol(1, nil, true)
	end, { group = 'Layouts', description = 'Decrease/increase the number of columns' }),
	--#endregion

	--#region Apps
	awful.key({ modkey }, 'd', function()
		local s = awful.screen.focused()
		awful.spawn(s.selected_tag.default_app, { tag = s.selected_tag })
	end, { group = 'Apps', description = "Open tag's default app" }),

	awful.key({ modkey }, 'Return', function()
		awful.spawn(apps.terminal)
	end, { group = 'Apps', description = 'Open default terminal' }),

	awful.key({ modkey }, 'e', function()
		awful.spawn(apps.file_manager)
	end, { group = 'Apps', description = 'Open default file manager' }),

	awful.key({ modkey }, 'b', function()
		awful.spawn(apps.browser)
	end, { group = 'Apps', description = 'Open default web browser' }),

	awful.key({ 'Control', 'Shift' }, 'Escape', function()
		awful.spawn(apps.terminal .. ' -e gtop')
	end, { group = 'Apps', description = 'Open system monitor' }),
	--#endregion

	--#region Tools

	--#region Brightness
	awful.key({}, 'XF86MonBrightnessDown', function()
		awful.spawn.easy_async_with_shell('light -G', function(stdout)
			local brightness = math.floor(math.max(tonumber(stdout) - 5, 5))
			awful.spawn.easy_async_with_shell('light -S ' .. brightness, function()
				awesome.emit_signal('module::brightness_osd', brightness)
				awesome.emit_signal('module::brightness_osd:show', true)
			end)
		end)
	end, { group = 'Tools', description = 'Decrease/increase brightness' }),

	awful.key({}, 'XF86MonBrightnessUp', function()
		awful.spawn.easy_async_with_shell('light -G', function(stdout)
			local brightness = math.floor(math.min(tonumber(stdout) + 5, 100))
			awful.spawn.easy_async_with_shell('light -S ' .. brightness, function()
				awesome.emit_signal('module::brightness_osd', brightness)
				awesome.emit_signal('module::brightness_osd:show', true)
			end)
		end)
	end, { group = 'Tools', description = 'Decrease/increase brightness' }),
	--#endregion

	--#region Volume
	awful.key({}, 'XF86AudioLowerVolume', function()
		awesome.emit_signal('widgets::volume', { diff = -5 })
	end, { group = 'Tools', description = 'Decrease/increase volume' }),

	awful.key({}, 'XF86AudioRaiseVolume', function()
		awesome.emit_signal('widgets::volume', { diff = 5 })
	end, { group = 'Tools', description = 'Decrease/increase volume' }),

	awful.key({}, 'XF86AudioMute', function()
		awesome.emit_signal('widgets::volume', { toggle_mute = true })
	end, { group = 'Tools', description = 'Toggle mute' }),
	--#endregion

	--#region Media
	awful.key({}, 'XF86AudioPrev', function()
		awful.spawn.easy_async_with_shell('playerctl previous', function()
			awesome.emit_signal('widgets::media')
		end)
	end, { group = 'Tools', description = 'Previous/next music' }),
	awful.key({}, 'XF86AudioNext', function()
		awful.spawn.easy_async_with_shell('playerctl next', function()
			awesome.emit_signal('widgets::media')
		end)
	end, { group = 'Tools', description = 'Previous/next music' }),
	awful.key({}, 'XF86AudioPlay', function()
		awful.spawn.easy_async_with_shell('playerctl play-pause', function()
			awesome.emit_signal('widgets::media')
		end)
	end, { group = 'Tools', description = 'Play/pause music' }),
	awful.key({}, 'XF86AudioPause', function()
		awful.spawn.easy_async_with_shell('playerctl play-pause', function()
			awesome.emit_signal('widgets::media')
		end)
	end, { group = 'Tools', description = 'Play/pause music' }),
	--#endregion

	--#endregion

	--#region Screenshots
	awful.key({}, 'Print', function()
		awful.spawn.easy_async_with_shell('flameshot screen -c', function() end)
	end, { group = 'Screenshots', description = 'Full screenshot' }),

	awful.key({ 'Shift' }, 'Print', function()
		awful.spawn.easy_async_with_shell('flameshot gui', function() end)
	end, { group = 'Screenshots', description = 'Area screenshot' })
	--#endregion
)

local number_of_tags = 0
for i, tag in pairs(tags) do
	number_of_tags = number_of_tags + 1
	global_keys = awful.util.table.join(
		global_keys,
		awful.key({ modkey }, '#' .. i + 9, function()
			local s = awful.screen.focused()
			if s.tags[i] then
				s.tags[i]:view_only()
			end
		end, { group = 'Tags', description = 'View tag #' }),
		awful.key({ modkey, 'Shift' }, '#' .. i + 9, function()
			if client.focus then
				local s = client.focus.screen
				if s.tags[i] then
					client.focus:move_to_tag(s.tags[i])
				end
			end
		end, { group = 'Tags', description = 'Move focused client to tag #' })
	)
end

local client_keys = awful.util.table.join(
	awful.key({ modkey }, 'q', function(c)
		c:kill()
	end, { group = 'Clients', description = 'Close focused client' }),

	awful.key({ modkey, 'Shift' }, 'j', function()
		awful.client.swap.byidx(-1)
	end, { group = 'Clients', description = 'Swap with previous/next client' }),

	awful.key({ modkey, 'Shift' }, 'k', function()
		awful.client.swap.byidx(1)
	end, { group = 'Clients', description = 'Swap with previous/next client' }),

	awful.key({ modkey, 'Shift' }, 'h', function(c)
		local t = c and c.first_tag or nil
		if t == nil then
			return
		end

		local tag = c.screen.tags[(t.index - 2) % number_of_tags + 1]
		c:move_to_tag(tag)
		awful.tag.viewprev()
	end, { group = 'Clients', description = 'Move client to previous/next tag' }),

	awful.key({ modkey, 'Shift' }, 'l', function(c)
		local t = c and c.first_tag or nil
		if t == nil then
			return
		end

		local tag = c.screen.tags[(t.index % number_of_tags) + 1]
		c:move_to_tag(tag)
		awful.tag.viewnext()
	end, { group = 'Clients', description = 'Move client to previous/next tag' }),

	awful.key({ modkey, 'Shift', 'Control' }, 'h', function(c)
		c:move_to_screen(c.screen.index - 1)
	end, { group = 'Clients', description = 'Move client to previous/next screen' }),

	awful.key({ modkey, 'Shift', 'Control' }, 'l', function(c)
		c:move_to_screen(c.screen.index + 1)
	end, { group = 'Clients', description = 'Move client to previous/next screen' }),

	awful.key({ modkey }, 'c', function(c)
		c.fullscreen = false
		c.maximized = false
		c.floating = not c.floating
		c:raise()
	end, { group = 'Clients', description = 'Toggle ' })
)

root.keys(global_keys)

return {
	modkey = modkey,
	altkey = altkey,
	global_keys = global_keys,
	client_keys = client_keys,
}
