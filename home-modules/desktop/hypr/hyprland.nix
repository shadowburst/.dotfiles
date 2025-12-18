{
  config,
  lib,
  pkgs,
  ...
}: {
  wayland.windowManager.hyprland = {
    enable = true;
    plugins = with pkgs; [
      hyprlandPlugins.hyprscrolling
      hyprlandPlugins.hypr-dynamic-cursors
    ];
    systemd.variables = ["--all"];
    settings = {
      "$mod" = "SUPER";
      "$terminal" = config.home.sessionVariables.TERMINAL;
      "$browser" = config.home.sessionVariables.BROWSER;
      monitor = [
        ", highres, auto, 1"
      ];
      workspace = [
        "1, default:true"

        # Smart gaps
        "w[tv1], gapsout:0, gapsin:0"
        "f[1], gapsout:0, gapsin:0"
      ];
      exec-once = [
        "protonvpn-app"
      ];
      exec = [
      ];
      env = [
        "XDG_SESSION_DESKTOP, wayland"
        "SSH_AUTH_SOCK, $XDG_RUNTIME_DIR/gcr/ssh"
      ];
      general = {
        border_size = 2;
        gaps_in = 2;
        gaps_out = 0;
        layout = "scrolling";
        "col.active_border" = lib.mkForce "$accent";
      };
      group = {
        "col.border_active" = lib.mkForce "$accent";
        groupbar."col.active" = lib.mkForce "$accent";
      };
      decoration = {
        rounding = 10;
        blur = {
          enabled = true;
          size = 6;
          xray = true;
        };
        shadow.enabled = false;
      };
      animations = {
        enabled = true;
        bezier = [
          "emphasizedAccel, 0.3, 0, 0.8, 0.15"
          "emphasizedDecel, 0.05, 0.7, 0.1, 1"
          "standard, 0.2, 0, 0, 1"
        ];
        animation = [
          "layersIn, 1, 3, emphasizedDecel, slide"
          "layersOut, 1, 2, emphasizedAccel, slide"
          "fadeLayers, 1, 3, standard"
          "windowsIn, 1, 3, emphasizedDecel"
          "windowsOut, 1, 1, emphasizedAccel"
          "windowsMove, 1, 4, standard"
          "workspaces, 1, 3, standard, slidefadevert"
          "fade, 1, 4, standard"
          "fadeDim, 1, 4, standard"
          "border, 1, 4, standard"
        ];
      };
      input = {
        kb_layout = "fr";
        kb_variant = "azerty";
        kb_options = "caps:escape_shifted_capslock";
        numlock_by_default = true;
        repeat_delay = 300;
        follow_mouse = 1;
        touchpad = {
          disable_while_typing = true;
          natural_scroll = true;
          drag_lock = true;
        };
      };
      gestures = {
        workspace_swipe_distance = 200;
        workspace_swipe_min_speed_to_force = 10;
      };
      gesture = [
        "3, vertical, workspace"
        "3, left, dispatcher, layoutmsg, focus r"
        "3, right, dispatcher, layoutmsg, focus l"
      ];
      dwindle.force_split = 2;
      group.groupbar = {
        font_size = 15;
        gradients = true;
        gradient_round_only_edges = false;
        gradient_rounding = 5;
        height = 25;
        indicator_height = 0;
        gaps_in = 3;
        gaps_out = 3;
      };
      xwayland.force_zero_scaling = true;
      misc = {
        session_lock_xray = true;
        disable_hyprland_logo = true;
        vrr = 0;
        allow_session_lock_restore = true;
        mouse_move_enables_dpms = true;
        key_press_enables_dpms = true;
        enable_swallow = true;
        swallow_regex = "^com\\.mitchellh\\.ghostty$";
        new_window_takes_over_fullscreen = 1;
      };
      cursor = {
        no_hardware_cursors = true;
        default_monitor = "DP-1";
      };
      layerrule = [
        "noanim, caelestia-(launcher|osd|notifications|border-exclusion|area-p)"
        "animation fade, caelestia-(drawers|background)"
        "order 1, caelestia-border-exclusion"
        "order 2, caelestia-bar"
        "xray 0, caelestia-.*"
        "blur, caelestia-.*"
        "blur, qs-.*"
        "blurpopups, caelestia-.*"
        "ignorealpha 0.8, caelestia-.*"
      ];
      windowrule = [
        "float, class:org.gnome.Calculator"
        "minsize 300 500, class:org.gnome.Calculator"
        "float, class:brave(.*), initialClass:negative:brave-browser"

        # Smart gaps
        "bordersize 0, floating:0, onworkspace:w[tv1]"
        "rounding 0, floating:0, onworkspace:w[tv1]"
        "bordersize 0, floating:0, onworkspace:f[1]"
        "rounding 0, floating:0, onworkspace:f[1]"
      ];
      bindm = [
        "$mod, mouse:272, movewindow"
        "$mod, mouse:273, resizewindow"
      ];
      bind = [
        # Compositor
        "$mod SHIFT, r, exec, hyprctl reload"
        "$mod, Escape, exec, loginctl lock-session"

        # Windows
        "CTRL ALT, delete, exec, hyprctl kill"
        "$mod, c, togglefloating,"
        "$mod, f, fullscreenstate, 2 -1"
        "$mod, g, layoutmsg, promote"
        "$mod, h, layoutmsg, focus l"
        "$mod, j, layoutmsg, focus d"
        "$mod, k, layoutmsg, focus u"
        "$mod, l, layoutmsg, focus r"
        "$mod, m, layoutmsg, colresize +conf"
        "$mod, p, pin,"
        "$mod, q, killactive,"
        "$mod, z, layoutmsg, togglefit"
        "$mod SHIFT, h, layoutmsg, movewindowto l"
        "$mod SHIFT, j, layoutmsg, movewindowto d"
        "$mod SHIFT, k, layoutmsg, movewindowto u"
        "$mod SHIFT, l, layoutmsg, movewindowto r"

        # Workspaces
        "$mod, ampersand, focusworkspaceoncurrentmonitor, 1"
        "$mod, eacute, focusworkspaceoncurrentmonitor, 2"
        "$mod, quotedbl, focusworkspaceoncurrentmonitor, 3"
        "$mod, apostrophe, focusworkspaceoncurrentmonitor, 4"
        "$mod, parenleft, focusworkspaceoncurrentmonitor, 5"
        "$mod, minus, focusworkspaceoncurrentmonitor, 6"
        "$mod, egrave, focusworkspaceoncurrentmonitor, 7"
        "$mod SHIFT, ampersand, movetoworkspacesilent, 1"
        "$mod SHIFT, eacute, movetoworkspacesilent, 2"
        "$mod SHIFT, quotedbl, movetoworkspacesilent, 3"
        "$mod SHIFT, apostrophe, movetoworkspacesilent, 4"
        "$mod SHIFT, parenleft, movetoworkspacesilent, 5"
        "$mod SHIFT, minus, movetoworkspacesilent, 6"
        "$mod SHIFT, egrave, movetoworkspacesilent, 7"
        "$mod SHIFT CTRL, ampersand, movetoworkspace, 1"
        "$mod SHIFT CTRL, eacute, movetoworkspace, 2"
        "$mod SHIFT CTRL, quotedbl, movetoworkspace, 3"
        "$mod SHIFT CTRL, apostrophe, movetoworkspace, 4"
        "$mod SHIFT CTRL, parenleft, movetoworkspace, 5"
        "$mod SHIFT CTRL, minus, movetoworkspace, 6"
        "$mod SHIFT CTRL, egrave, movetoworkspace, 7"

        # Monitors
        "$mod, tab, swapactiveworkspaces, current -1"
        "$mod CTRL, h, focusmonitor, l"
        "$mod CTRL, j, focusmonitor, d"
        "$mod CTRL, k, focusmonitor, u"
        "$mod CTRL, l, focusmonitor, r"
        "$mod SHIFT CTRL, h, movewindow, mon:l"
        "$mod SHIFT CTRL, j, movewindow, mon:d"
        "$mod SHIFT CTRL, k, movewindow, mon:u"
        "$mod SHIFT CTRL, l, movewindow, mon:r"

        # Menus
        "$mod, Space, exec, dms ipc call spotlight toggle"
        "$mod, x, exec, dms ipc call powermenu toggle"

        # Applications
        "$mod, return, exec, $terminal"
        "$mod, b, exec, $browser"
        "$mod, d, exec, launch-default"
        "$mod, e, exec, $terminal -e yazi"
        "CTRL SHIFT, escape, exec, $terminal -e dgop"
        ", xf86calculator, exec, gnome-calculator"

        # Audio
        ", xf86audiomute, exec, dms ipc call audio mute"
        ", xf86audiolowervolume, exec, dms ipc call audio decrement 5"
        ", xf86audioraisevolume, exec, dms ipc call audio increment 5"
        ", xf86audioprev, exec, dms ipc call mpris previous"
        ", xf86audionext, exec, dms ipc call mpris next"
        ", xf86audioplay, exec, dms ipc call mpris playPause"
        ", xf86audiopause, exec, dms ipc call mpris playPause"
        "$mod CTRL, Space, exec, dms ipc call mpris playPause"

        # Brightness
        ", xf86monbrightnessdown, exec, dms ipc call brightness decrement 5 backlight:amdgpu_bl1"
        ", xf86monbrightnessup, exec, dms ipc call brightness increment 5 backlight:amdgpu_bl1"
        ", xf86kbdbrightnessdown, exec, dms ipc call brightness decrement 33 leds:asus::kbd_backlight"
        ", xf86kbdbrightnessup, exec, dms ipc call brightness increment 33 leds:asus::kbd_backlight"

        # Screenshots
        ", print, exec, dms screenshot full --no-file"
        "SHIFT, print, exec, dms screenshot --no-file"
        "CTRL, print, exec, dms screenshot full"
        "CTRL SHIFT, print, exec, dms screenshot full"

        "$mod SHIFT, S, exec, dms screenshot --no-file"
        "$mod CTRL SHIFT, S, exec, dms screenshot"

        # Other
        "$mod, v, exec, dms ipc call clipboard toggle"
        "$mod, p, exec, dms color pick -a"
      ];
      ecosystem = {
        no_update_news = true;
        no_donation_nag = true;
      };

      plugin = {
        dynamic-cursors = {
          mode = "stretch";
          shake = {
            effects = true;
          };
        };
        hyprscrolling = {
          fullscreen_on_one_column = true;
          explicit_column_widths = "0.5, 1";
          focus_fit_method = 1;
        };
      };
    };
  };
}
