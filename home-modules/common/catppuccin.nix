{inputs, ...}: {
  imports = [
    inputs.catppuccin.homeModules.catppuccin
  ];

  catppuccin = {
    flavor = "macchiato";
    accent = "blue";

    bat.enable = true;
    cava.enable = true;
    delta.enable = true;
    fish.enable = true;
    hyprlock.enable = true;
    kvantum.enable = true;
    lazygit.enable = true;
    starship.enable = true;
    tmux.enable = true;
    yazi.enable = true;
  };
}
