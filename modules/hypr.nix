_: {
  flake.nixosModules.gui =
    { ... }:
    {
      programs.seahorse.enable = true;
    };

  flake.homeModules.gui =
    { pkgs, ... }:
    {
      home.sessionPath = [ "$HOME/.local/bin" ];

      home.packages = with pkgs; [
        nautilus
        gnome-calculator
        hyprpicker
        hyprshot
        pavucontrol
        socat
        satty
        wl-clipboard
      ];

      # Fix screensharing double menu
      xdg.configFile."hypr/xdph.conf".text = /* hyprlang */ ''
        screencopy {
          allow_token_by_default = true
        }
      '';

      home.sessionVariables.NIXOS_OZONE_WL = "1";
    };
}
