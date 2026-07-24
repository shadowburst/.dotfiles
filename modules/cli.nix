_: {
  flake.homeModules.cli =
    { pkgs, ... }:
    {
      programs.bat.enable = true;
      programs.carapace.enable = true;
      programs.cava.enable = true;
      programs.direnv.enable = true;

      home.packages = with pkgs; [
        act
        curl
        devbox
        fd
        ffmpeg
        gcc
        gnumake
        jq
        pnpm
        ripgrep
        sqlit-tui
        sshfs
        tldr
        trash-cli
        tree
        wget
        unzip
        xdg-utils
      ];
    };
}
