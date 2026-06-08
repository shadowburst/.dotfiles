{ inputs, ... }:
{
  flake.homeModules.paseo =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      system = pkgs.stdenv.hostPlatform.system;
      paseoDesktop = inputs.paseo.packages.${system}.desktop;
      paseoDesktopWithSpeechLibs = pkgs.symlinkJoin {
        name = "paseo-desktop-with-speech-libs";
        paths = [ paseoDesktop ];
        nativeBuildInputs = [ pkgs.makeWrapper ];
        postBuild = ''
          wrapProgram $out/bin/paseo-desktop \
            --prefix LD_LIBRARY_PATH : ${pkgs.stdenv.cc.cc.lib}/lib
        '';
      };
    in
    {
      home.packages = lib.optionals pkgs.stdenv.hostPlatform.isLinux [
        paseoDesktopWithSpeechLibs
      ];

      programs.mcp = {
        enable = true;
        servers.paseo = {
          url = "http://127.0.0.1:6767/mcp/agents";
        };
      };

      xdg.configFile."Paseo/desktop-settings.json".source =
        config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/paseo/desktop-settings.json";
    };
}
