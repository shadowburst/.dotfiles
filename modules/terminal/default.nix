{ self, ... }:
{
  flake.nixosModules.terminal =
    { lib, pkgs, ... }:
    {
      imports = [
        self.nixosModules.fish
        self.nixosModules.ssh
      ];
    };

  flake.homeModules.terminal =
    { lib, pkgs, ... }:
    {
      imports = [
        self.homeModules.bash
        self.homeModules.btop
        self.homeModules.claude-code
        self.homeModules.comma
        self.homeModules.eza
        self.homeModules.fish
        self.homeModules.fzf
        self.homeModules.git
        self.homeModules.nushell
        self.homeModules.neovim
        self.homeModules.opencode
        self.homeModules.sesh
        self.homeModules.starship
        self.homeModules.television
        self.homeModules.tmux
        self.homeModules.worktrunk
        self.homeModules.yazi
        self.homeModules.zoxide
      ];

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
