{ inputs, ... }:

{
  imports = [
    inputs.catppuccin.nixosModules.catppuccin
  ];

  catppuccin = {
    flavor = "macchiato";
    accent = "blue";

    grub.enable = true;
    plymouth.enable = true;
  };

  boot.plymouth.enable = true;
}
