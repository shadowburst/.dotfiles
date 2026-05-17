_: {
  flake.homeModules.pi =
    { config, pkgs, ... }:
    {
      home.packages = [ pkgs.pi-coding-agent ];

      home.file.".pi/agent/extensions".source =
        config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/pi/extensions";

      home.file.".pi/agent/themes".source =
        config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/pi/themes";

      home.file.".pi/agent/settings.json".source =
        config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/pi/settings.json";
    };
}
