_: {
  flake.nixosModules.hyprland =
    { lib, pkgs, ... }:
    {
      programs.hyprland = {
        enable = true;
        withUWSM = true;
      };
    };

  flake.homeModules.hyprland =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    {
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

          workspace = [
            # Smart gaps
            "w[tv1], gapsout:0, gapsin:0"
            "f[1], gapsout:0, gapsin:0"
          ];

          windowrule = [
            "match:class org.gnome.Calculator, float 1, center 1, size 300 500"
            "match:initial_class brave-(\\w+)-Default, float 1, center 1, size 400 600"
            "match:initial_class brave, match:initial_title Open File, float 1, center 1, size 1000 600"

            # Smart gaps
            "match:workspace w[tv1], match:float 0, border_size 0"
            "match:workspace w[tv1], match:float 0, rounding 0"
            "match:workspace f[1], match:float 0, border_size 0"
            "match:workspace f[1], match:float 0, rounding 0"
          ];

          layerrule = [
            "match:namespace noctalia-background-.*$, ignore_alpha 0.5, blur true, blur_popups true"
            "match:namespace selection, no_anim on"
          ];

          general."col.active_border" = lib.mkForce "$accent";
          general.border_size = 2;
          general.gaps_in = 2;
          general.gaps_out = "0,20,0,20";
          general.layout = "scrolling";

          dwindle.force_split = 2;

          master.allow_small_split = true;
          master.orientation = "left";

          scrolling.fullscreen_on_one_column = true;
          scrolling.column_width = 1.0;
          scrolling.focus_fit_method = 1;
          scrolling.explicit_column_widths = "0.5, 1.0";

          decoration.blur = {
            enabled = true;
            size = 6;
            xray = true;
          };
          decoration.rounding = 6;
          decoration.shadow.enabled = false;

          animations = {
            enabled = true;
            animation = [
              "layersIn, 1, 3, default, slide"
              "layersOut, 1, 2, default, slide"
              "fadeLayers, 1, 3, default"
              "windowsIn, 1, 3, default, gnomed"
              "windowsOut, 1, 1, default, gnomed"
              "windowsMove, 1, 4, default"
              "workspaces, 1, 3, default, slidefadevert"
              "fade, 1, 4, default"
              "fadeDim, 1, 4, default"
              "border, 1, 4, default"
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
          input.focus_on_close = 1;

          gestures.workspace_swipe_distance = 200;
          gestures.workspace_swipe_min_speed_to_force = 10;

          xwayland.force_zero_scaling = true;

          misc.allow_session_lock_restore = true;
          misc.disable_hyprland_logo = true;
          misc.enable_swallow = true;
          misc.key_press_enables_dpms = true;
          misc.mouse_move_enables_dpms = true;
          misc.on_focus_under_fullscreen = 1;
          misc.session_lock_xray = true;
          misc.swallow_regex = "^kitty$";
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
            "$mod, q, killactive,"
            "$mod SHIFT, p, pin,"

            # Scrolling keybinds
            "$mod, h, layoutmsg, focus l"
            "$mod, j, layoutmsg, focus d"
            "$mod, k, layoutmsg, focus u"
            "$mod, l, layoutmsg, focus r"
            "$mod, m, layoutmsg, promote"
            "$mod, comma, layoutmsg, colresize -conf"
            "$mod, semicolon, layoutmsg, colresize +conf"
            "$mod SHIFT, comma, layoutmsg, swapcol l"
            "$mod SHIFT, semicolon, layoutmsg, swapcol r"
            "$mod SHIFT, h, movewindow, l"
            "$mod SHIFT, j, movewindow, d"
            "$mod SHIFT, k, movewindow, u"
            "$mod SHIFT, l, movewindow, r"

            # Master keybinds
            # "$mod, h, movefocus, l"
            # "$mod, j, movefocus, d"
            # "$mod, k, movefocus, u"
            # "$mod, l, movefocus, r"
            # "$mod, comma, layoutmsg, addmaster"
            # "$mod, semicolon, layoutmsg, removemaster"
            # "$mod SHIFT, h, movewindow, l"
            # "$mod SHIFT, j, movewindow, d"
            # "$mod SHIFT, k, movewindow, u"
            # "$mod SHIFT, l, movewindow, r"

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
            ", xf86calculator, exec, uwsm app -- gnome-calculator"

            # Screenshots
            ", print, exec, hyprshot --freeze -m region --clipboard-only"
            "CTRL, print, exec, hyprshot --freeze -m window --clipboard-only"
            "$mod SHIFT, S, exec, hyprshot --freeze -m region --clipboard-only"
            "$mod CTRL SHIFT, S, exec, hyprshot --freeze -m window --clipboard-only"

            # Other
            "CTRL ALT, delete, exec, hyprctl kill"
            "$mod, Escape, exec, loginctl lock-session"
            "$mod, p, exec, hyprpicker -a"
          ];
        };
      };

      xdg.configFile."uwsm/env".source =
        "${config.home.sessionVariablesPackage}/etc/profile.d/hm-session-vars.sh";
    };
}
