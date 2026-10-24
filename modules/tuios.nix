_: {
  flake.homeModules.cli =
    { config, pkgs, ... }:
    {
      home.packages = [
        pkgs.tuios
        (pkgs.writeShellApplication {
          name = "tuios-session";
          runtimeInputs = with pkgs; [
            bash
            coreutils
            jq
            tuios
            util-linux
            zoxide
          ];
          text = ''
            exec bash "${config.xdg.configHome}/tuios/session.sh" "$@"
          '';
        })
      ];

      home.shellAliases.s = "tv tuios";

      xdg.configFile."tuios".source =
        config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/tuios";
    };
}
