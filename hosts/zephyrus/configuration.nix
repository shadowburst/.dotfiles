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
      powerManagement = {
        enable = true;
        finegrained = true;
      };
      dynamicBoost.enable = true;
      open = true;
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
    GSK_RENDERER = "ngl";
    LIBVA_DRIVER_NAME = "radeonsi";
    VDPAU_DRIVER = "radeonsi";
    VK_DRIVER_FILES = "/run/opengl-driver-32/share/vulkan/icd.d/radeon_icd.i686.json:/run/opengl-driver/share/vulkan/icd.d/radeon_icd.x86_64.json";
    __EGL_VENDOR_LIBRARY_FILENAMES = "/run/opengl-driver/share/glvnd/egl_vendor.d/50_mesa.json";
    __GLX_VENDOR_LIBRARY_NAME = "mesa";
    __NV_PRIME_RENDER_OFFLOAD = 0;
    __VK_LAYER_NV_optimus = "non_NVIDIA_only";
  };
  environment.systemPackages = with pkgs; [
    (writeShellScriptBin "nvidia-offload" ''
      export VK_DRIVER_FILES=/run/opengl-driver-32/share/vulkan/icd.d/nvidia_icd.i686.json:/run/opengl-driver/share/vulkan/icd.d/nvidia_icd.x86_64.json
      export __EGL_VENDOR_LIBRARY_FILENAMES=/run/opengl-driver/share/glvnd/egl_vendor.d/10_nvidia.json
      export __GLX_VENDOR_LIBRARY_NAME=nvidia
      export __NV_PRIME_RENDER_OFFLOAD=1
      export __NV_PRIME_RENDER_OFFLOAD_PROVIDER=NVIDIA-G0
      export __VK_LAYER_NV_optimus=NVIDIA_only
      exec "$@"
    '')
  ];
}
