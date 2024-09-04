{
  config,
  inputs,
  pkgs,
  ...
}:

{
  imports = [ inputs.ags.homeManagerModules.default ];

  programs.ags = {
    enable = true;
  };

  xdg.configFile."ags".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/modules/user/desktop/ags/config";

  home.packages = with pkgs; [
    dart-sass
    inotify-tools
  ];
}
