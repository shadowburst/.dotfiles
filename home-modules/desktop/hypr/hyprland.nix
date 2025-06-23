{config, ...}: {
  wayland.windowManager.hyprland = {
    enable = true;
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
      ];
      exec-once = [
        "brightnessctl -s set 40%"
      ];
      exec = [
        "qs kill; qs"
      ];
      env = [
        "XDG_SESSION_DESKTOP, wayland"
        "SSH_AUTH_SOCK, $XDG_RUNTIME_DIR/gcr/ssh"
      ];
      general = {
        border_size = 2;
        gaps_in = 2;
        gaps_out = 0;
        layout = "dwindle";
      };
      decoration = {
        rounding = 10;
        blur = {
          enabled = true;
          size = 6;
          xray = true;
        };
        shadow = {
          enabled = false;
        };
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
        follow_mouse = 1;
        touchpad = {
          disable_while_typing = true;
          natural_scroll = true;
          drag_lock = true;
        };
      };
      gestures = {
        workspace_swipe = true;
        workspace_swipe_fingers = 3;
        workspace_swipe_distance = 200;
        workspace_swipe_min_speed_to_force = 10;
      };
      dwindle = {
        force_split = 2;
      };
      xwayland = {
        force_zero_scaling = true;
      };
      misc = {
        disable_hyprland_logo = true;
        vrr = 0;
        allow_session_lock_restore = true;
        mouse_move_enables_dpms = true;
        key_press_enables_dpms = true;
        enable_swallow = true;
        swallow_regex = "^Alacritty|kitty$";
        new_window_takes_over_fullscreen = 1;
      };
      cursor = {
        no_hardware_cursors = true;
        default_monitor = "DP-1";
      };
      windowrule = [
        "float, class:org.gnome.Calculator"
        "minsize 300 500, class:org.gnome.Calculator"
        "float, class:xdg-desktop-portal-gtk"
        "minsize 1000 800, class:xdg-desktop-portal-gtk"
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
        "$mod, q, killactive,"
        "$mod, c, togglefloating,"
        "$mod, p, pin,"
        "$mod, f, fullscreenstate, 2 -1"
        "$mod, h, movefocus, l"
        "$mod, j, movefocus, d"
        "$mod, k, movefocus, u"
        "$mod, l, movefocus, r"
        "$mod SHIFT, h, movewindow, l"
        "$mod SHIFT, j, movewindow, d"
        "$mod SHIFT, k, movewindow, u"
        "$mod SHIFT, l, movewindow, r"

        # Groups
        "$mod, g, togglegroup"
        "$mod ALT, tab, changegroupactive, f"
        "$mod ALT, h, movewindoworgroup, l"
        "$mod ALT, j, movewindoworgroup, d"
        "$mod ALT, k, movewindoworgroup, u"
        "$mod ALT, l, movewindoworgroup, r"

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
        "$mod, Space, global, caelestia:launcher"
        "$mod, x, global, caelestia:session"
        "$mod CTRL, n, global, caelestia:clearNotifs"

        # Applications
        "$mod, return, exec, $terminal"
        "$mod, b, exec, $browser"
        "$mod, d, exec, launch-default"
        "$mod, e, exec, $terminal -e yazi"
        "CTRL SHIFT, escape, exec, $terminal -e htop"
        ", xf86calculator, exec, gnome-calculator"

        # Audio
        ", xf86audiomute, exec, wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle"
        ", xf86audiolowervolume, exec, wpctl set-volume @DEFAULT_AUDIO_SINK@ '5%-'"
        ", xf86audioraisevolume, exec, wpctl set-volume @DEFAULT_AUDIO_SINK@ '5%+'"
        ", xf86audioprev, global, caelestia:mediaPrev"
        ", xf86audionext, global, caelestia:mediaNext"
        ", xf86audioplay, global, caelestia:mediaToggle"
        ", xf86audiopause, global, caelestia:mediaToggle"
        "$mod CTRL, Space, global, caelestia:mediaToggle"

        # Brightness
        ", xf86monbrightnessdown, global, caelestia:brightnessDown"
        ", xf86monbrightnessup, global, caelestia:brightnessUp"

        # Screenshots
        ", print, global, caelestia:screenshot"
        "$mod SHIFT, S, global, caelestia:screenshot"

        # Other
        "$mod SHIFT, p, exec, hyprpicker -a"
      ];
      ecosystem = {
        no_update_news = true;
        no_donation_nag = true;
      };
    };
  };
}
