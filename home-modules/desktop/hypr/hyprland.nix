{
  config,
  lib,
  ...
}: {
  xdg.configFile."uwsm/env".source = "${config.home.sessionVariablesPackage}/etc/profile.d/hm-session-vars.sh";
  wayland.windowManager.hyprland = {
    enable = true;
    systemd.enable = false;

    settings = {
      "$mod" = "SUPER";
      "$terminal" = config.home.sessionVariables.TERMINAL;
      "$browser" = config.home.sessionVariables.BROWSER;

      env = [
        "XDG_CURRENT_DESKTOP, Hyprland"
        "XDG_SESSION_DESKTOP, wayland"
      ];

      monitor = [
        ", highres, auto, 1"
      ];

      exec-once = [
        "hyprctl dispatch workspace 1"
      ];

      workspace = [
        "1, monitor:DP-1, default:true"

        # Smart gaps
        "w[tv1], gapsout:0, gapsin:0"
        "f[1], gapsout:0, gapsin:0"
      ];

      windowrule = [
        "match:class org.gnome.Calculator, float 1, center 1, size 300 500"
        "match:initial_class brave-(\\w+)-Default, float 1, center 1, size 400 600"

        # Smart gaps
        "match:workspace w[tv1], match:float 0, border_size 0"
        "match:workspace w[tv1], match:float 0, rounding 0"
        "match:workspace f[1], match:float 0, border_size 0"
        "match:workspace f[1], match:float 0, rounding 0"
      ];

      layerrule = [
        "match:namespace noctalia-background-.*$, ignore_alpha 0.5, blur true, blur_popups true"
      ];

      general."col.active_border" = lib.mkForce "$accent";
      general.border_size = 2;
      general.gaps_in = 2;
      general.gaps_out = 0;
      general.layout = "dwindle";

      decoration.blur = {
        enabled = true;
        size = 6;
        xray = true;
      };
      decoration.rounding = 10;
      decoration.shadow.enabled = false;

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

      input.follow_mouse = 1;
      input.kb_layout = "fr";
      input.kb_variant = "azerty";
      input.kb_options = "caps:escape_shifted_capslock";
      input.numlock_by_default = true;
      input.repeat_delay = 300;
      input.touchpad.disable_while_typing = true;
      input.touchpad.drag_lock = true;
      input.touchpad.natural_scroll = true;

      gestures.workspace_swipe_distance = 200;
      gestures.workspace_swipe_min_speed_to_force = 10;

      dwindle.force_split = 2;

      xwayland.force_zero_scaling = true;

      misc.allow_session_lock_restore = true;
      misc.disable_hyprland_logo = true;
      misc.enable_swallow = true;
      misc.key_press_enables_dpms = true;
      misc.mouse_move_enables_dpms = true;
      misc.on_focus_under_fullscreen = 1;
      misc.session_lock_xray = true;
      misc.swallow_regex = "^com\\.mitchellh\\.ghostty$";
      misc.vrr = 0;

      cursor.default_monitor = "DP-1";
      cursor.no_hardware_cursors = true;

      ecosystem.no_donation_nag = true;
      ecosystem.no_update_news = true;

      gesture = [
        "3, vertical, workspace"
        "3, left, dispatcher, layoutmsg, focus r"
        "3, right, dispatcher, layoutmsg, focus l"
      ];

      bindm = [
        "$mod, mouse:272, movewindow"
        "$mod, mouse:273, resizewindow"
      ];
      bind = [
        # Windows
        "$mod, c, togglefloating,"
        "$mod, f, fullscreenstate, 2 -1"
        "$mod, h, movefocus, l"
        "$mod, j, movefocus, d"
        "$mod, k, movefocus, u"
        "$mod, l, movefocus, r"
        "$mod, q, killactive,"
        "$mod SHIFT, h, movewindow, l"
        "$mod SHIFT, j, movewindow, d"
        "$mod SHIFT, k, movewindow, u"
        "$mod SHIFT, l, movewindow, r"
        "$mod SHIFT, p, pin,"

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

        # Applications
        "$mod, return, exec, uwsm app -- $terminal"
        "$mod, b, exec, uwsm app -- $browser"
        "$mod, d, exec, uwsm app -- launch-default"
        "$mod, e, exec, uwsm app -- $terminal -e yazi"
        "CTRL SHIFT, escape, exec, uwsm app -- $terminal -e btop"

        # Screenshots
        ", print, exec, hyprshot --raw -m output -m active | satty --filename -"
        "CTRL, print, exec, hyprshot --raw -m window | satty --filename -"
        "$mod SHIFT, S, exec, hyprshot --raw -m output -m active | satty --filename -"
        "$mod CTRL SHIFT, S, exec, hyprshot --raw -m window | satty --filename -"

        # Other
        "CTRL ALT, delete, exec, hyprctl kill"
        "$mod, Escape, exec, loginctl lock-session"
        "$mod, p, exec, hyprpicker -a"
      ];
    };
  };
}
