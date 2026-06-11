{ self, ... }:
{
  flake.homeModules.dev =
    { config, pkgs, ... }:
    let
      dotfilesDir = "${config.home.homeDirectory}/.dotfiles";

      mkDotfilesSymlink = path: {
        source = config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/${path}";
      };
    in
    {
      imports = [
        self.homeModules.codex
        self.homeModules.git
        self.homeModules.neovim
        self.homeModules.opencode
        self.homeModules.paseo
        self.homeModules.pi
        self.homeModules.worktrunk
      ];

      home.file = {
        # Global Agent Skills directory shared by Agent Skills-compatible tools.
        # Out-of-store symlink keeps it writable so `pnpm dlx skills add ...` can add skills dynamically.
        ".agents/skills" = mkDotfilesSymlink "config/agent-skills";
      };

      xdg.stateFile."skills/.skill-lock.json" =
        mkDotfilesSymlink "config/agent-skills/.skill-lock.json";

      home.packages = with pkgs; [
        act
        devbox
        gcc
        gnumake
        pnpm
      ];
    };
}
