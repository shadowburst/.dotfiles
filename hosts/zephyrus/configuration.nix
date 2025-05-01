{
  inputs,
  pkgs,
  ...
}: {
  imports = [
    inputs.nixos-hardware.nixosModules.asus-zephyrus-ga402x-nvidia
    ./hardware-configuration.nix
    ../../nixos-modules/common
    ../../nixos-modules/laptop
  ];

  boot = {
    kernelPackages = pkgs.linuxPackages_latest;

    initrd.luks.devices."luks-110fffaf-55a6-4c06-b218-0896a9217436".device = "/dev/disk/by-uuid/110fffaf-55a6-4c06-b218-0896a9217436";
    loader = {
      systemd-boot.enable = true;

      efi = {
        canTouchEfiVariables = true;
      };

      timeout = 1;
    };
  };

  console.keyMap = "fr";

  hardware = {
    graphics = {
      enable = true;
      enable32Bit = true;
    };
  };

  networking.hostName = "zephyrus";

  services.asusd = {
    asusdConfig.source = ./config/asusd.ron;
    auraConfigs."19b6".source = ./config/aura_19b6.ron;
  };

  environment.etc."asusd/slash.ron" = {
    source = ./config/slash.ron;
    mode = "0644";
  };
}
