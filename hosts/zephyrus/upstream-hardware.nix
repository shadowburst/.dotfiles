{
  config,
  inputs,
  lib,
  pkgs,
  ...
}: let
  inherit
    (lib)
    mkDefault
    mkForce
    ;
in {
  imports = [
    inputs.nixos-hardware.nixosModules.common-cpu-amd
    inputs.nixos-hardware.nixosModules.common-cpu-amd-pstate
    inputs.nixos-hardware.nixosModules.common-gpu-amd
    inputs.nixos-hardware.nixosModules.common-pc-laptop
    inputs.nixos-hardware.nixosModules.common-pc-ssd
    inputs.nixos-hardware.nixosModules.common-gpu-nvidia
  ];

  config = {
    boot = {
      kernelPackages = mkDefault pkgs.linuxPackages_latest;
      kernelModules = ["kvm-amd"];
      kernelParams = [
        "mem_sleep_default=deep"
        "pcie_aspm.policy=powersupersave"
      ];
    };

    services = {
      asusd = {
        enable = mkDefault true;
      };

      supergfxd.enable = mkDefault true;
    };

    # Enable the Nvidia card, as well as Prime and Offload: NVIDIA GeForce RTX 4060 Mobile
    boot.blacklistedKernelModules = ["nouveau"];

    services.xserver.videoDrivers = mkForce [
      "amdgpu"
      "nvidia"
    ];

    hardware = {
      amdgpu.initrd.enable = mkDefault true;

      nvidia = {
        modesetting.enable = true;
        nvidiaSettings = mkDefault true;

        prime = {
          offload = {
            enable = mkDefault true;
            enableOffloadCmd = mkDefault true;
          };
          amdgpuBusId = "PCI:101:0:0";
          nvidiaBusId = "PCI:1:0:0";
        };

        powerManagement = {
          enable = true;
          finegrained = true;
        };
      };
    };
    # Meditek doesn't seem to be quite sensitive enough on the default roaming settings:
    #   https://wiki.archlinux.org/title/Wpa_supplicant#Roaming
    #   https://wiki.archlinux.org/title/Iwd#iwd_keeps_roaming
    #
    # But NixOS doesn't have the tweaks for IWD, yet.
    networking.wireless.iwd.settings =
      lib.mkIf (config.networking.wireless.iwd.enable && config.networking.wireless.scanOnLowSignal)
      {
        General = {
          RoamThreshold = -75;
          RoamThreshold5G = -80;
          RoamRetryInterval = 20;
        };
      };
  };
}
