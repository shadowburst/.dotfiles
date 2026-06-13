_: {
  flake.homeModules.cli =
    { config, pkgs, ... }:
    let
      dotfilesDir = "${config.home.homeDirectory}/.dotfiles";

      mkDotfilesSymlink = path: {
        source = config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/${path}";
      };
    in
    {
      home.file = {
        # Global Agent Skills directory shared by Agent Skills-compatible tools.
        # Out-of-store symlink keeps it writable so `pnpm dlx skills add ...` can add skills dynamically.
        ".agents/skills" = mkDotfilesSymlink "config/agent-skills";
      };

      xdg.stateFile."skills/.skill-lock.json" =
        mkDotfilesSymlink "config/agent-skills/.skill-lock.json";

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
