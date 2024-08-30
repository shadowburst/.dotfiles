{ inputs, pkgs, ... }:

{
  imports = [
    (import ./hardware-configuration.nix)
    
      inputs.nixos-hardware.nixosModules.dell-xps-13-9310
      inputs.nixos-hardware.nixosModules.common-gpu-intel
  ];

  boot = {
    kernelPackages = pkgs.linuxPackages_zen;

    loader = {
      grub = {
        enable = true;
        devices = [ "nodev" ];
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

  hardware = {
    bluetooth.enable = true;
    graphics = {
      enable = true;
      enable32Bit = true;
    };
    intelgpu.driver = "xe";
  };

  networking.hostName = "xps";

  console.keyMap = "fr";
  
  services = {
    blueman.enable = true;
    fstrim.enable = true;
    pipewire = {
      enable = true;
      audio.enable = true;
      pulse.enable = true;
      alsa = {
        enable = true;
        support32Bit = true;
      };
    };
    power-profiles-daemon.enable = true;
    upower.enable = true;
  };
}
