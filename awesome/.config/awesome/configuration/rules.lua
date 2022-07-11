local awful = require('awful')
local ruled = require('ruled')

local client_buttons = require('configuration.buttons').client_buttons
local client_keys = require('configuration.keybindings').client_keys
local tags = require('configuration.tags')

ruled.client.connect_signal('request::rules', function()
	-- All clients will match this rule.
	ruled.client.append_rule({
		id = 'global',
		rule = {},
		properties = {
			titlebars_enabled = false,
			focus = awful.client.focus.filter,
			raise = true,
			floating = false,
			maximized = false,
			above = false,
			below = false,
			ontop = false,
			sticky = false,
			maximized_horizontal = false,
			maximized_vertical = false,
			buttons = client_buttons,
			keys = client_keys,
			screen = awful.screen.focused,
			placement = awful.placement.no_overlap + awful.placement.no_offscreen,
		},
	})

	-- Dialogs
	ruled.client.append_rule({
		id = 'dialog',
		rule_any = {
			type = { 'dialog' },
			class = { 'Wicd-client.py', 'calendar.google.com' },
		},
		properties = {
			floating = true,
			ontop = true,
			skip_decoration = true,
			placement = awful.placement.centered,
		},
	})

	-- Docks
	ruled.client.append_rule({
		id = 'dock',
		rule_any = {
			type = { 'dock' },
		},
		properties = {
			floating = true,
			ontop = true,
			is_fixed = false,
            sticky = true,
			skip_decoration = true,
		},
	})

	-- Modals
	ruled.client.append_rule({
		id = 'modal',
		rule_any = {
			type = { 'modal' },
		},
		properties = {
			floating = true,
			ontop = true,
			skip_decoration = true,
			placement = awful.placement.centered,
		},
	})

	-- Utilities
	ruled.client.append_rule({
		id = 'utility',
		rule_any = {
			type = { 'utility' },
		},
		properties = {
			floating = true,
			skip_decoration = true,
			placement = awful.placement.centered,
		},
	})

	-- Splash
	ruled.client.append_rule({
		id = 'splash',
		rule_any = {
			type = { 'splash' },
			name = { 'Discord Updater' },
		},
		properties = {
			floating = true,
			above = true,
			skip_decoration = true,
			placement = awful.placement.centered,
		},
	})

	-- Picture in picture
	ruled.client.append_rule({
		id = 'picture-in-picture',
		rule_any = {
			name = { 'Picture-in-picture' },
		},
		properties = {
			floating = true,
			ontop = true,
			is_fixed = false,
			placement = awful.placement.bottom_right,
		},
	})

	for _, tag in pairs(tags) do
		ruled.client.append_rule({
			id = tag.type,
			rule_any = {
				class = tag.matches,
			},
			properties = {
				tag = tag.name,
				switch_to_tags = true,
			},
		})
	end

	-- Floating
	ruled.client.append_rule({
		id = 'floating',
		rule_any = {
			instance = {
				'file_progress',
				'Popup',
			},
			class = {
				'Pavucontrol',
				'scrcpy',
				'Mugshot',
				'Pulseeffects',
				'Blueman-adapters',
				'Blueman-manager',
				'Xephyr',
				'Authy Desktop',
				'Xfce4-power-manager-settings',
				'Gnome-calculator',
				'Nm-connection-editor',
			},
			role = {
				'AlarmWindow',
				'ConfigManager',
				'pop-up',
			},
		},
		properties = {
			skip_decoration = true,
			ontop = true,
			floating = true,
			focus = awful.client.focus.filter,
			raise = true,
			placement = awful.placement.centered,
		},
	})
end)
