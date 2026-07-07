_: {
  flake.homeModules.cli =
    { pkgs, ... }:
    let
      tomlFormat = pkgs.formats.toml { };
    in
    {
      home.packages = with pkgs; [
        herdr
      ];

      xdg.configFile."herdr/config.toml".source = tomlFormat.generate "herdr-config.toml" {
        onboarding = false;

        terminal = {
          new_cwd = "follow";
          shell_mode = "auto";
        };

        theme.name = "catppuccin";

        ui = {
          confirm_close = false;
          prompt_new_tab_name = false;
        };

        advanced.scrollback_limit_bytes = 10485760;

        keys = {
          detach = "";
          goto = "alt+space";
          next_workspace = "alt+tab";

          next_tab = "alt+n";
          previous_tab = "alt+p";
          new_tab = "alt+t";
          switch_tab = "alt+1..9";

          focus_pane_left = "alt+h";
          focus_pane_down = "alt+j";
          focus_pane_up = "alt+k";
          focus_pane_right = "alt+l";
          zoom = "alt+f";
          close_pane = "alt+q";
          split_vertical = "alt+v";
          split_horizontal = "alt+s";
          resize_mode = "alt+plus";

          edit_scrollback = "alt+esc";
        };
      };
    };
}
