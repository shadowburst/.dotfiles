local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local env = require('env')
local icons = require('theme.icons').network
local widget_container = require('widgets.containers.widget-container')

local interfaces = env.network_interfaces

local create_network_widget = function()

	local properties = {
		disabled = false,
		mode = 'none',
		healthy_connection = true
	}

	local text_widget = wibox.widget({
		text   = '',
		widget = wibox.widget.textbox
	})

	local buttons = awful.util.table.join(
		awful.button(
			{}, 1,
			function()
				awful.spawn('nm-connection-editor')
			end
		),
		awful.button(
			{}, 3,
			function()
				awful.spawn.easy_async_with_shell(
					properties.disabled and 'rfkill unblock wlan' or 'rfkill block wlan',
					function()
					end
				)
			end
		)
	)

	local network_widget = widget_container(
		{
			id 		= 'network_layout',
			layout	= wibox.layout.fixed.horizontal,
			spacing = beautiful.widget_spacing,
			{
				id	   = 'icon',
				markup = '',
				font   = beautiful.nerd_font .. ' 18',
				widget = wibox.widget.textbox
			}
		},
		buttons
	)

	local update_icon = function()
		local icon = properties.disabled and icons.wifi.off or icons.wifi.on
		local color = beautiful.disabled

		if not properties.disabled and properties.mode ~= 'none' then
			icon = properties.mode == 'wired' and icons.ethernet or icons.wifi.on
			color = properties.healthy_connection and beautiful.primary or beautiful.warning
		end

		network_widget:get_children_by_id('icon')[1]:set_markup('<span color="' .. color .. '">' .. icon .. '</span>')
	end

	local update_text = function(text)
		text_widget:set_text(text or '')

		local network_layout = network_widget:get_children_by_id('network_layout')[1]
		local text_index = network_layout:index(text_widget)
		if properties.mode == 'none' or properties.disabled then
			if text_index then
				network_layout:remove(text_index)
			end
		else
			if not text_index then
				network_layout:add(text_widget)
			end
		end
	end

	local update_widget = function()
		local interface = properties.mode == 'wired' and interfaces.lan or interfaces.wlan

		if not properties.disabled then
			if properties.mode == 'wired' then
				update_text('ethernet')
			else
				awful.spawn.easy_async_with_shell(
					[[ bash -c "iw dev ]] .. interface .. [[ link | awk '/SSID:/{print(\$2)}'" ]],
					function(stdout)
						update_text(stdout)
					end
				)
			end

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
					properties.healthy_connection = not stdout:match('Connected but no internet')
					update_icon()
				end
			)
		else
			update_text()
			update_icon()
		end
	end

	awesome.connect_signal(
		'widgets::network',
		function()
			awful.spawn.easy_async_with_shell(
				[=[
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
				]=],
				function(mode_stdout)
					properties.mode = mode_stdout:gsub('%\n', '')
					awful.spawn.easy_async_with_shell(
						'rfkill list wlan',
						function(status_stdout)
							properties.disabled = status_stdout:match('Soft blocked: yes')
							update_widget()
						end
					)
				end
			)
		end
	)

	gears.timer({
		timeout = 5,
		call_now = true,
		autostart = true,
		callback = function()
			awesome.emit_signal('widgets::network')
		end
	})

	return network_widget
end

return create_network_widget()