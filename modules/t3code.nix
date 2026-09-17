_: {
  flake.homeModules.gui =
    {
      config,
      pkgs,
      ...
    }:
    let
      dataDir = "${config.home.homeDirectory}/.dotfiles/config/t3code";
    in
    {
      home.packages = [
        (pkgs.t3code.override {
          enableClaude = true;
          enableOpencode = true;
        })
      ];

      home.file.".t3" = {
        force = true;
        source = config.lib.file.mkOutOfStoreSymlink dataDir;
      };
    };
}
