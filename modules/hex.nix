{ inputs, ... }:
{
  flake.homeModules.gui = { config, ... }: {
    imports = [ inputs.hex.homeManagerModules.hex ];

    programs.hex = {
      enable = true;
      autostart = true;
    };

    xdg.dataFile."hex/settings.json".source =
      config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/hex/settings.json";
  };
}
