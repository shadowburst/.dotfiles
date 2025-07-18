{inputs, ...}: {
  imports = [inputs.catppuccin.homeModules.catppuccin];

  catppuccin = {
    flavor = "mocha";
    accent = "lavender";

    bat.enable = true;
    brave.enable = true;
    cava.enable = true;
    delta.enable = true;
    fish.enable = true;
    hyprland.enable = true;
    kitty.enable = true;
    ghostty.enable = true;
    kvantum.enable = true;
    lazygit.enable = true;
    starship.enable = true;
    tmux.enable = true;
    yazi.enable = true;
  };
}
