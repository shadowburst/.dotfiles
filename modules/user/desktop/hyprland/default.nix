{
  config,
  lib,
  pkgs,
  ...
}:

let
  launch-default = pkgs.writeShellScriptBin "launch-default" (lib.fileContents ./bin/launch-default);
  watch-monitors = pkgs.writeShellScriptBin "watch-monitors" (lib.fileContents ./bin/watch-monitors);

  app-menu = pkgs.writeShellScriptBin "app-menu" ''
    ags -r "(await import('file://$XDG_CONFIG_HOME/ags/modules/windows/index.js')).toggle('applications')"
  '';
  power-menu = pkgs.writeShellScriptBin "power-menu" ''
    ags -r "(await import('file://$XDG_CONFIG_HOME/ags/modules/windows/index.js')).toggle('power')"
  '';
in
{
  imports = [
    ./hypridle.nix
    ./hyprlock.nix
    ./hyprpaper.nix
    ./hyprpicker.nix
  ];

  wayland.windowManager.hyprland = {
    enable = true;
    systemd.variables = [ "--all" ];
    plugins = with pkgs.hyprlandPlugins; [
      hypr-dynamic-cursors
    ];
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
        "${pkgs.polkit_gnome}/libexec/polkit-gnome-authentication-agent-1 &"
        "${watch-monitors}/bin/watch-monitors"
        "brightnessctl -s set 40%"
        "transmission-daemon"
      ];
      exec = [
        "pkill ags; ags"
      ];
      general = {
        border_size = 2;
        gaps_in = 0;
        gaps_out = 0;
        layout = "master";
      };
      decoration = {
        rounding = 0;
        drop_shadow = false;
        shadow_range = 4;

        blur = {
          enabled = true;
          size = 6;
          xray = true;
        };
      };
      animations = {
        enabled = true;
        bezier = [
          "ease_in_out, 0.85, 0, 0.15, 1"
        ];
        animation = [
          "windows, 1, 3, ease_in_out, popin 50%"
          "border, 0, 3, default"
          "fade, 1, 3, default"
          "workspaces, 1, 3, ease_in_out, slidefadevert 50%"
        ];
      };
      input = {
        kb_layout = "fr";
        kb_variant = "azerty";
        # kb_options = "caps:swapescape";
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
        workspace_swipe_fingers = 4;
      };
      dwindle = {
        force_split = 2;
      };
      master = {
        new_on_top = false;
        no_gaps_when_only = true;
        mfact = 0.55;
        orientation = "left";
      };
      misc = {
        disable_hyprland_logo = true;
        vfr = true;
        vrr = 2;
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
        "float, org.gnome.Calculator"
        "minsize 300 500, org.gnome.Calculator"
      ];
      layerrule = [
        "animation slide top, bar-*"
        "animation slide top, backdrop"
        "blur, backdrop-dar"
        "xray 0, backdrop-dark"
        "animation slide top, applications"
        "animation slide top, power"
        "animation slide top, torrents"
        "animation slide top, updates"
      ];
      bindm = [
        "$mod, mouse:272, movewindow"
        "$mod, mouse:273, resizewindow"
      ];
      bind = [
        # Compositor
        "$mod SHIFT, r, exec, hyprctl reload"

        # Windows
        "CTRL ALT, delete, exec, hyprctl kill"
        "$mod, q, killactive,"
        "$mod, c, togglefloating,"
        "$mod, p, pin,"
        "$mod, f, fullscreen, 0"
        "ALT, tab, cyclenext,"
        "ALT SHIFT, tab, cyclenext, prev"
        "$mod, h, movefocus, l"
        "$mod, j, movefocus, d"
        "$mod, k, movefocus, u"
        "$mod, l, movefocus, r"
        "$mod SHIFT, h, movewindow, l"
        "$mod SHIFT, j, movewindow, d"
        "$mod SHIFT, k, movewindow, u"
        "$mod SHIFT, l, movewindow, r"

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
        "$mod, a, exec, ${app-menu}/bin/app-menu"
        "$mod, x, exec, ${power-menu}/bin/power-menu"

        # Applications
        "$mod, return, exec, $terminal"
        "$mod, b, exec, $browser"
        "$mod, d, exec, ${launch-default}/bin/launch-default"
        "$mod, e, exec, $terminal -e yazi"
        "CTRL SHIFT, escape, exec, $terminal -e htop"
        ", xf86calculator, exec, gnome-calculator"

        # Audio
        ", xf86audiomute, exec, wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle"
        ", xf86audiolowervolume, exec, wpctl set-volume @DEFAULT_AUDIO_SINK@ '5%-'"
        ", xf86audioraisevolume, exec, wpctl set-volume @DEFAULT_AUDIO_SINK@ '5%+'"
        ", xf86audioprev, exec, playerctl previous"
        ", xf86audioplay, exec, playerctl play-pause"
        ", xf86audiopause, exec, playerctl play-pause"
        ", xf86audionext, exec, playerctl next"

        # Brightness
        ", xf86monbrightnessdown, exec, brightnessctl -s set 5%- -n 5"
        ", xf86monbrightnessup, exec, brightnessctl -s set 5%+"

        # Screenshots
        ", print, exec, grimshot --notify copy window"
        "SHIFT, print, exec, grimshot --notify copy area"
        "CTRL, print, exec, grimshot --notify savecopy window"
        "CTRL SHIFT, print, exec, grimshot --notify savecopy area"
        "ALT, print, exec, hyprpicker -a"
      ];
      plugin = {
        dynamic-cursors = {
          mode = "stretch";
          shake = {
            nearest = false;
            threshold = 3.0;
          };
        };
      };
    };
  };

  home.packages = with pkgs; [
    brightnessctl
    gnome-calculator
    htop
    playerctl
    socat
    sway-contrib.grimshot
  ];
}
