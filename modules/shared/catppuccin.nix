{ inputs, ... }:
{
  flake.nixosModules.catppuccin =
    { lib, pkgs, ... }:
    {
      imports = [ inputs.catppuccin.nixosModules.catppuccin ];

      catppuccin = {
        flavor = "mocha";
        accent = "lavender";

        grub.enable = true;
        plymouth.enable = true;
        tty.enable = true;
      };

      boot.plymouth.enable = true;
    };

  flake.homeModules.catppuccin =
    { lib, pkgs, ... }:
    {
      imports = [ inputs.catppuccin.homeModules.catppuccin ];

      catppuccin = {
        flavor = "mocha";
        accent = "lavender";

        bat.enable = true;
        brave.enable = true;
        btop.enable = true;
        cava.enable = true;
        delta.enable = true;
        fish.enable = true;
        fzf.enable = true;
        gh-dash.enable = true;
        ghostty.enable = true;
        hyprland.enable = true;
        kitty.enable = true;
        lazygit.enable = true;
        mpv.enable = true;
        nushell.enable = true;
        opencode.enable = true;
        starship.enable = true;
        television.enable = true;
        tmux.enable = true;
        yazi.enable = true;
      };
    };
}
