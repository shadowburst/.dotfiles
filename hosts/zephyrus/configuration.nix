{
  inputs,
  pkgs,
  ...
}: {
  imports = [
    inputs.nixos-hardware.nixosModules.asus-zephyrus-ga402x-nvidia
    ./hardware-configuration.nix
    ./nvidia.nix
    ../../nixos-modules/common
    ../../nixos-modules/desktop
  ];

  boot = {
    kernelPackages = pkgs.linuxPackages_6_18;

    initrd.luks.devices."luks-110fffaf-55a6-4c06-b218-0896a9217436".device = "/dev/disk/by-uuid/110fffaf-55a6-4c06-b218-0896a9217436";
    loader = {
      grub = {
        enable = true;
        devices = ["nodev"];
        efiSupport = true;
        useOSProber = true;
        configurationLimit = 5;
      };
      efi.canTouchEfiVariables = true;
      timeout = 1;
    };
  };

  console.keyMap = "fr";

  hardware.bluetooth.enable = true;
  hardware.graphics = {
    enable = true;
    enable32Bit = true;
  };

  networking.hostName = "zephyrus";

  systemd.settings.Manager = {
    DefaultTimeoutStopSec = "10s";
  };

  services.asusd = {
    asusdConfig.source = ./config/asusd.ron;
    auraConfigs."19b6".source = ./config/aura_19b6.ron;
  };
  environment.etc."asusd/slash.ron" = {
    source = ./config/slash.ron;
    mode = "0644";
  };

  environment.variables = {
    LIBVA_DRIVER_NAME = "radeonsi";
    VDPAU_DRIVER = "radeonsi";
  };
}
