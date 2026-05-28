{ inputs, ... }:
{
  flake.nixosModules.noctalia = { ... }: {
    programs.gpu-screen-recorder.enable = true;

    nix.settings = {
      extra-substituters = [ "https://noctalia.cachix.org" ];
      extra-trusted-public-keys = [
        "noctalia.cachix.org-1:pCOR47nnMEo5thcxNDtzWpOxNFQsBRglJzxWPp3dkU4="
      ];
    };
  };

  flake.homeModules.noctalia =
    { config, ... }:
    {
      imports = [ inputs.noctalia.homeModules.default ];

      programs.noctalia = {
        enable = true;
        systemd.enable = true;
      };

      programs.satty.enable = true;

      xdg.configFile."noctalia/config.toml".source =
        config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/noctalia/config.toml";
    };
}
