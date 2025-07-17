{
  inputs,
  pkgs,
  ...
}: {
  imports = [
    inputs.nixos-hardware.nixosModules.asus-zephyrus-ga402x-nvidia
    ./hardware-configuration.nix
    ../../nixos-modules/common
    ../../nixos-modules/desktop
  ];

  boot = {
    kernelPackages = pkgs.linuxPackages_zen;

    initrd.luks.devices."luks-110fffaf-55a6-4c06-b218-0896a9217436".device = "/dev/disk/by-uuid/110fffaf-55a6-4c06-b218-0896a9217436";
    loader = {
      grub = {
        enable = true;
        devices = ["nodev"];
        efiSupport = true;
        useOSProber = true;
        configurationLimit = 5;
      };
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
    nvidia = {
      open = true;
      powerManagement.enable = true;
      dynamicBoost.enable = true;
      prime = {
        sync.enable = true;
        offload = {
          enable = false;
          enableOffloadCmd = false;
        };
      };
    };
  };

  networking.hostName = "zephyrus";

  systemd.extraConfig = "DefaultTimeoutStopSec=10s";

  services.asusd = {
    asusdConfig.source = ./config/asusd.ron;
    auraConfigs."19b6".source = ./config/aura_19b6.ron;
  };
  environment.etc."asusd/slash.ron" = {
    source = ./config/slash.ron;
    mode = "0644";
  };

  environment.variables = {
    LIBVA_DRIVER_NAME = "nvidia";
    VDPAU_DRIVER = "nvidia";
    __GLX_VENDOR_LIBRARY_NAME = "nvidia";
  };
}
