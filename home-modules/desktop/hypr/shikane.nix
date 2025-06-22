{
  config,
  lib,
  pkgs,
  ...
}: {
  home.packages = with pkgs; [
    shikane
  ];

  home.activation = {
    createShikaneConfig = lib.hm.dag.entryAfter ["writeBoundary"] ''
      run mkdir -p ${config.home.homeDirectory}/.config/shikane
      run touch ${config.home.homeDirectory}/.config/shikane/config.toml
    '';
  };

  services.shikane.enable = true;
}
