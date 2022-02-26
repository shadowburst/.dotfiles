local beautiful = require('beautiful')
local gears = require('gears')

local icons = require('theme.icons')

local theme_dir = gears.filesystem.get_configuration_dir() .. 'theme/'
local xresources = beautiful.xresources
local colors = xresources.get_current_theme()
local dpi = xresources.apply_dpi

local theme = {
	--#region Directories
	dir = theme_dir,
	icons_dir = theme_dir .. 'icons/',
	--#endregion

	--#region Wallpaper & Icons
	icons = icons,
	wallpaper = theme_dir .. 'wallpaper.jpg',
	--#endregion

	--#region Colors
	background = colors.background,
	foreground = colors.foreground,
	transparent = colors.background .. '00',
	opacity = '66',

	black = colors.color0,
	dark_gray = colors.color8,

	dark_red = colors.color1,
	light_red = colors.color9,

	dark_green = colors.color2,
	light_green = colors.color10,

	dark_yellow = colors.color3,
	light_yellow = colors.color11,

	dark_blue = colors.color4,
	light_blue = colors.color12,

	dark_magenta = colors.color5,
	light_magenta = colors.color13,

	dark_cyan = colors.color6,
	light_cyan = colors.color14,

	light_gray = colors.color7,
	white = colors.color15,
	--#endregion
}

--#region Color Theme
theme.primary = theme.dark_blue
theme.success = theme.dark_green
theme.danger = theme.dark_red
theme.warning = theme.dark_yellow
theme.disabled = theme.foreground .. theme.opacity
theme.highlight = theme.dark_gray .. theme.opacity

theme.bg_focus = theme.background
theme.bg_minimize = theme.background
theme.bg_normal = theme.background
theme.bg_urgent = theme.dark_red

theme.fg_focus = theme.foreground
theme.fg_minimize = theme.foreground
theme.fg_normal = theme.foreground
theme.fg_urgent = theme.foreground
--#endregion

--#region UI events
theme.leave_event = theme.transparent
theme.hover_event = theme.white .. '10'
theme.press_event = theme.white .. '15'
--#endregion

--#region Fonts
theme.base_font = 'Roboto Regular'
theme.font = theme.base_font .. ' 10'
theme.base_font_bold = 'Roboto Bold'
theme.font_bold = theme.base_font_bold .. ' 10'
theme.nerd_font = 'FiraCode Nerd Font Mono'
--#endregion

--#region Borders
theme.border_focus = theme.primary
theme.border_marked = theme.background
theme.border_normal = theme.background
theme.border_radius = dpi(9)
theme.border_width = dpi(4)
theme.useless_gap = dpi(4)

theme.separator_color = theme.foreground
--#endregion

--#region Taglist
theme.taglist_spacing = dpi(3)
theme.taglist_font = theme.nerd_font .. ' 20'

theme.taglist_bg_empty = theme.transparent
theme.taglist_bg_focus = theme.primary
theme.taglist_bg_occupied = theme.transparent
theme.taglist_bg_urgent = theme.transparent
theme.taglist_bg_volatile = theme.transparent

theme.taglist_fg_empty = theme.foreground
theme.taglist_fg_focus = theme.background
theme.taglist_fg_occupied = theme.primary
theme.taglist_fg_urgent = theme.danger
theme.taglist_fg_volatile = theme.foreground
--#endregion

--#region Tasklist
theme.tasklist_font = theme.font
theme.tasklist_plain_task_name = true

theme.tasklist_bg_focus = theme.background

theme.tasklist_fg_focus = theme.foreground
theme.tasklist_fg_urgent = theme.foreground
--#endregion

--#region System tray
theme.bg_systray = '#37383f'
theme.systray_icon_spacing = dpi(10)
--#endregion

--#endregion

--#region Shapes
theme.rect = function(cr, w, h)
	return gears.shape.partially_rounded_rect(cr, w, h, false, false, false, false, 0)
end
theme.rounded_rect = function(cr, w, h)
	return gears.shape.rounded_rect(cr, w, h, dpi(12))
end
--#endregion

--#region Tooltips
theme.tooltip_align = 'bottom'
theme.tooltip_bg_color = theme.background
theme.tooltip_border_color = theme.highlight
theme.tooltip_border_width = dpi(2)
theme.tooltip_delay = 1
theme.tooltip_fg_color = theme.foreground
theme.tooltip_font = theme.nerd_font .. ' 10'
theme.tooltip_margins = dpi(8)
theme.tooltip_shape = theme.rounded_rect
--#endregion

--#region Hotkeys
theme.hotkeys_bg = theme.background
theme.hotkeys_border_color = theme.primary
theme.hotkeys_border_width = dpi(2)
theme.hotkeys_description_font = theme.font
theme.hotkeys_fg = theme.foreground
theme.hotkeys_font = theme.font_bold
theme.hotkeys_modifiers_fg = theme.foreground
theme.hotkeys_group_margin = dpi(20)
theme.hotkeys_opacity = theme.opacity
theme.hotkeys_shape = theme.rounded_rect
--#endregion

--#region Notifications
theme.notification_bg = theme.transparent
theme.notification_border_color = theme.transparent
theme.notification_border_width = dpi(0)
theme.notification_fg = theme.foreground
theme.notification_font = theme.font
theme.notification_icon_resize_strategy = 'center'
theme.notification_icon_size = dpi(32)
theme.notification_margin = dpi(5)
theme.notification_position = 'top_right'
theme.notification_shape = theme.rect
theme.notification_spacing = dpi(5)
--#endregion

--#region Menu
theme.menu_bg_normal = theme.background
theme.menu_bg_focus = theme.background

theme.menu_fg_normal = theme.foreground
theme.menu_fg_focus = theme.foreground

theme.menu_border_color = theme.primary
theme.menu_border_width = dpi(1)

theme.menu_height = dpi(34)
theme.menu_width = dpi(200)
--#endregion

--#region Layout
theme.layout_floating = theme.icons.layout.floating
theme.layout_fullscreen = theme.icons.layout.max
theme.layout_max = theme.icons.layout.max
theme.layout_dwindle = theme.icons.layout.tiled
theme.layout_tile = theme.icons.layout.tiled
theme.layout_tileleft = theme.icons.layout.tiled
theme.layout_tileright = theme.icons.layout.tiled
theme.layout_tilebottom = theme.icons.layout.tiled
theme.layout_tiletop = theme.icons.layout.tiled
theme.layout_fairv = theme.icons.layout.tiled
theme.layout_fairh = theme.icons.layout.tiled
theme.layout_spiral = theme.icons.layout.tiled
theme.layout_magnifier = theme.icons.layout.tiled
theme.layout_cornernw = theme.icons.layout.tiled
theme.layout_cornerne = theme.icons.layout.tiled
theme.layout_cornersw = theme.icons.layout.tiled
theme.layout_cornerse = theme.icons.layout.tiled

--#endregion

--#region Widgets
theme.widget_spacing = dpi(7)
--#endregion

return theme
