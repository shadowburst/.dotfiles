_: {
  flake.homeModules.gui =
    { config, pkgs, ... }:
    let
      json = pkgs.formats.json { };
      colors = config.catppuccin.palette.colors;
    in
    {
      home.packages = [
        pkgs.herdr-desktop
        pkgs.herdr-core
      ];

      # The app can read these files, but UI settings saves cannot change them.
      xdg.configFile."herdr-app/settings.json".source = json.generate "herdr-settings.json" {
        core = "${pkgs.herdr-core}/bin/hc";
        font = config.stylix.fonts.monospace.name;
        font_size = config.programs.kitty.settings.font_size * 4.0 / 3.0;
        theme = "catppuccin";
        telemetry = false;
      };

      xdg.configFile."herdr-app/themes/catppuccin.json".source = json.generate "herdr-theme.json" {
        background = colors.base.hex;
        foreground = colors.text.hex;
        selection = colors.surface2.hex;
        cursor = colors.lavender.hex;
        ansi = map (name: colors.${name}.hex) [
          "surface1"
          "red"
          "green"
          "yellow"
          "blue"
          "pink"
          "teal"
          "subtext1"
          "surface2"
          "red"
          "green"
          "yellow"
          "blue"
          "pink"
          "teal"
          "subtext0"
        ];
      };

      xdg.configFile."herdr-app/keys.json".source = json.generate "herdr-keys.json" {
        global = {
          "alt-space" = "mod.open:picker";
          "alt-b" = "layout.toggle:sidebar";
          "alt-tab" = "space.next";
          "alt-shift-tab" = "space.prev";
          "alt-up" = "agent.prev";
          "alt-down" = "agent.next";
          "alt-n" = "tab.next";
          "alt-p" = "tab.prev";
          "alt-t" = "tab.new";
          "alt-h" = "pane.go:left";
          "alt-j" = "pane.go:down";
          "alt-k" = "pane.go:up";
          "alt-l" = "pane.go:right";
          "alt-f" = "pane.zoom";
          "alt-q" = "pane.close";
          "alt-v" = "pane.split:right";
          "alt-s" = "pane.split:down";
          "alt-r" = "mod.open:changes";
          "ctrl-shift-n" = "space.new";
          "ctrl-shift-p" = "app.palette";
          "ctrl-," = "app.settings";
          "ctrl-+" = "app.zoom_in";
          "ctrl-=" = "app.zoom_in";
          "ctrl--" = "app.zoom_out";
          "ctrl-0" = "app.zoom_reset";
          "f2" = "tab.rename";
          "shift-f2" = "space.rename";
        };
        terminal = {
          "ctrl-backspace" = builtins.fromJSON ''"send:\u0017"'';
          "ctrl-delete" = builtins.fromJSON ''"send:\u001bd"'';
          "ctrl-left" = builtins.fromJSON ''"send:\u001bb"'';
          "ctrl-right" = builtins.fromJSON ''"send:\u001bf"'';
          "ctrl-shift-c" = "terminal.copy";
          "ctrl-shift-v" = "terminal.paste";
          "ctrl-v" = "terminal.paste_image";
        };
      };
    };
}
