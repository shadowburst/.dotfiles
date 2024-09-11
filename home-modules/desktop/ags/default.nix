{
  config,
  inputs,
  pkgs,
  ...
}:

let
  app-menu = pkgs.writeShellScriptBin "app-menu" ''
    ags -r "(await import('file://$XDG_CONFIG_HOME/ags/modules/windows/index.js')).toggle('applications')"
  '';
  power-menu = pkgs.writeShellScriptBin "power-menu" ''
    ags -r "(await import('file://$XDG_CONFIG_HOME/ags/modules/windows/index.js')).toggle('power')"
  '';
in
{
  imports = [ inputs.ags.homeManagerModules.default ];

  programs.ags.enable = true;

  xdg.configFile."ags".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home-modules/desktop/ags/config";
  home.file.".cache/ags/hyprpanel".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home-modules/desktop/ags/hyprpanel";

  home.packages = with pkgs; [
    app-menu
    power-menu

    hyprpanel
    dart-sass
  ];
}
