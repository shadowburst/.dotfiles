{inputs, ...}: {
  imports = [inputs.catppuccin.nixosModules.catppuccin];

  catppuccin = {
    flavor = "mocha";
    accent = "lavender";

    grub.enable = true;
    plymouth.enable = true;
    tty.enable = true;
  };

  boot.plymouth.enable = true;
}
