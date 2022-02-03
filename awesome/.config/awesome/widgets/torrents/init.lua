local awful = require('awful')
local beautiful = require('beautiful')
local gears = require('gears')
local wibox = require('wibox')

local apps  = require('configuration.apps')
local env   = require('env')
local icons = require('theme.icons').torrents
local widget_container = require('widgets.containers.widget-container')

local dpi = beautiful.xresources.apply_dpi

local create_torrents_widget = function()

    local buttons = awful.util.table.join(
        awful.button(
            {}, 1,
            function()
                awful.spawn(apps.terminal .. ' -e tremc')
            end
        )
    )

    local torrents_widget = widget_container(
        {
            layout  = wibox.layout.fixed.horizontal,
            spacing = dpi(14),
            {
                layout  = wibox.layout.fixed.horizontal,
                spacing = dpi(7),
                {
                    markup = '<span color="' .. beautiful.success .. '">' .. icons.download .. '</span>',
                    font   = beautiful.nerd_font .. ' 18',
                    widget = wibox.widget.textbox
                },
                {
                    id     = 'download_count',
                    text   = '0',
                    widget = wibox.widget.textbox
                }
            },
            {
                layout  = wibox.layout.fixed.horizontal,
                spacing = dpi(7),
                {
                    markup = '<span color="' .. beautiful.warning .. '">' .. icons.upload .. '</span>',
                    font   = beautiful.nerd_font .. ' 18',
                    widget = wibox.widget.textbox
                },
                {
                    id     = 'upload_count',
                    text   = '0',
                    widget = wibox.widget.textbox
                }
            }
        },
        buttons
    )

    local torrents_tooltip =  awful.tooltip({
        objects             = {torrents_widget},
        text                = 'None',
        delay_show          = beautiful.tooltip_delay,
        mode                = 'outside',
        align               = 'bottom',
        margin_leftright    = dpi(8),
        margin_topbottom    = dpi(8),
        preferred_positions = {'right', 'left', 'top', 'bottom'}
    })

    local count = function(str, pattern)
        return select(2, str:gsub(pattern, pattern))
    end

    awesome.connect_signal(
        'widgets::torrents',
        function()
            awful.spawn.easy_async_with_shell(
                'transmission-remote -l',
                function(stdout)
                    local total = count(stdout, '\n') - 2
                    local upload_count = count(stdout, '100%%')
                    local download_count = total - upload_count

                    local visible = env.debug or total > 0
                    if torrents_widget.visible ~= visible then
                        torrents_widget:set_visible(visible)
                    end
                    if not visible then
                        return
                    end

                    if download_count then
                        torrents_widget:get_children_by_id('download_count')[1]:set_text(download_count)
                    end

                    if upload_count then
                        torrents_widget:get_children_by_id('upload_count')[1]:set_text(upload_count)
                    end

                    torrents_tooltip:set_text(stdout)
                end
            )
        end
    )

    gears.timer({
		timeout = 5,
		call_now = true,
		autostart = true,
		callback = function()
			awesome.emit_signal('widgets::torrents')
		end
	})

    return torrents_widget
end

return create_torrents_widget()