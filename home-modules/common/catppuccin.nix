{inputs, ...}: {
  imports = [
    inputs.catppuccin.homeModules.catppuccin
  ];

  catppuccin = {
    flavor = "macchiato";
    accent = "lavender";

    bat.enable = true;
    brave.enable = true;
    cava.enable = true;
    delta.enable = true;
    fish.enable = true;
    hyprland.enable = true;
    kitty.enable = true;
    kvantum.enable = true;
    lazygit.enable = true;
    starship.enable = true;
    tmux.enable = true;
    yazi.enable = true;
  };
}
