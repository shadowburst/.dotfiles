local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local env = require('env')
local icons = require('theme.icons')
local widget_container = require('widgets.containers.widget-container')

local interfaces = env.network_interfaces

local properties = {
	disabled = false,
	healthy_connection = true,
	mode = 'none',
	ssid = '',
}

local check_updates = function()
	local args = {
		disabled = false,
		healthy_connection = true,
		mode = 'none',
		ssid = '',
	}

	awful.spawn.easy_async('rfkill list wlan', function(status)
		args.disabled = not status:match('Soft blocked: no')

		if args.disabled and not properties.disabled then
			awesome.emit_signal('widgets::network', args)
			return
		end

		awful.spawn.easy_async_with_shell([=[
          wireless="]=] .. interfaces.wlan .. [=["
					wired="]=] .. interfaces.lan .. [=["
					net="/sys/class/net/"

					wired_state="down"
					wireless_state="down"
					network_mode=""

					# Check network state based on interface's operstate value
					function check_network_state() {
						# Check what interface is up
						if [[ "${wireless_state}" == "up" ]];
						then
							network_mode='wireless'
						elif [[ "${wired_state}" == "up" ]];
						then
							network_mode='wired'
						else
							network_mode='none'
						fi
					}

					# Check if network directory exist
					function check_network_directory() {
						if [[ -n "${wireless}" && -d "${net}${wireless}" ]];
						then
							wireless_state="$(cat "${net}${wireless}/operstate")"
						fi
						if [[ -n "${wired}" && -d "${net}${wired}" ]]; then
							wired_state="$(cat "${net}${wired}/operstate")"
						fi
						check_network_state
					}

					# Start script
					function print_network_mode() {
						# Call to check network dir
						check_network_directory
						# Print network mode
						printf "${network_mode}"
					}

					print_network_mode
				]=], function(mode)
			args.mode = mode:gsub('%\n', '')

			local interface = properties.mode == 'wired' and interfaces.lan or interfaces.wlan
			awful.spawn.easy_async(
				[[ bash -c "iw dev ]] .. interface .. [[ link | awk '/SSID:/{print(\$2)}'" ]],
				function(ssid)
					args.ssid = args.mode == 'wired' and 'ethernet' or ssid

					awful.spawn.easy_async_with_shell(
						[=[
                status_ping=0

                packets="$(ping -q -w2 -c2 1.1.1.1 | grep -o "100% packet loss")"
                if [ ! -z "${packets}" ];
                then
                  status_ping=0
                else
                  status_ping=1
                fi

                if [ $status_ping -eq 0 ];
                then
                  echo 'Connected but no internet'
                fi
              ]=],
						function(stdout)
							args.healthy_connection = not stdout:match('Connected but no internet')

							if
								args.ssid == properties.ssid
								and args.mode == properties.mode
								and args.healthy_connection == properties.healthy_connection
							then
								return
							end

							awesome.emit_signal('widgets::network', args)
						end
					)
				end
			)
		end)
	end)
end

local create_network_widget = function()
	local ssid_widget = wibox.widget({
		text = '',
		widget = wibox.widget.textbox,
	})

	local buttons = {
		awful.button({}, 1, function()
			awful.spawn('nm-connection-editor')
		end),
		awful.button({}, 3, function()
			awful.spawn.easy_async(properties.disabled and 'rfkill unblock wlan' or 'rfkill block wlan', function()
				properties.disabled = not properties.disabled
				awesome.emit_signal('widgets::network')
			end)
		end),
	}

	local network_widget = widget_container({
		id = 'network_layout',
		layout = wibox.layout.fixed.horizontal,
		spacing = beautiful.icon_spacing,
		{
			id = 'icon',
			markup = '',
			font = beautiful.nerd_font .. ' 20',
			widget = wibox.widget.textbox,
		},
	}, buttons, true)

	awesome.connect_signal('widgets::network', function(args)
		properties = args or properties

		local icon = properties.disabled and icons.wifi_off or icons.wifi_on
		local color = beautiful.disabled

		if not properties.disabled and properties.mode ~= 'none' then
			icon = properties.mode == 'wired' and icons.ethernet or icons.wifi_on
			color = properties.healthy_connection and beautiful.primary or beautiful.warning
		end

		network_widget:get_children_by_id('icon')[1]:set_markup('<span color="' .. color .. '">' .. icon .. '</span>')

		ssid_widget:set_text(properties.ssid or '')

		local network_layout = network_widget:get_children_by_id('network_layout')[1]
		local ssid_index = network_layout:index(ssid_widget)

		if properties.mode == 'none' or properties.disabled then
			if ssid_index then
				network_layout:remove(ssid_index)
			end
		else
			if not ssid_index then
				network_layout:add(ssid_widget)
			end
		end
	end)

	check_updates()

	return network_widget
end

gears.timer({
	timeout = 5,
	call_now = false,
	autostart = true,
	callback = check_updates,
})

return create_network_widget
