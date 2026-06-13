{ inputs, ... }:
{
  flake.homeModules.cli =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      system = pkgs.stdenv.hostPlatform.system;
      paseoCli = inputs.paseo.packages.${system}.paseo;
      paseoDesktop = pkgs.symlinkJoin {
        name = "paseo-desktop-with-speech-libs";
        paths = [ inputs.paseo.packages.${system}.desktop ];
        nativeBuildInputs = [ pkgs.makeWrapper ];
        postBuild = ''
          wrapProgram $out/bin/paseo-desktop \
            --prefix LD_LIBRARY_PATH : ${pkgs.stdenv.cc.cc.lib}/lib
        '';
      };
    in
    {
      home.packages = lib.optionals pkgs.stdenv.hostPlatform.isLinux [
        paseoCli
        paseoDesktop
      ];

      xdg.configFile."Paseo/desktop-settings.json".source =
        config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/paseo/desktop-settings.json";
    };
}
