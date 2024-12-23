{
  config,
  inputs,
  pkgs,
  ...
}:

let
  power-menu = pkgs.writeShellScriptBin "power-menu" ''
    ags -r "(await import('file://$XDG_CONFIG_HOME/ags/modules/windows/index.js')).toggle('power')"
  '';
in
{
  imports = [ inputs.ags.homeManagerModules.default ];

  programs.ags.enable = true;

  xdg.configFile = {
    "ags".source =
      config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home-modules/desktop/ags/config";
    "hyprpanel".source =
      config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home-modules/desktop/ags/hyprpanel";
  };

  home.packages = with pkgs; [
    power-menu

    hyprpanel
    dart-sass
  ];
}
