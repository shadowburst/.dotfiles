_: {
  flake.nixosModules.lenovo-p14s-hardware =
    {
      config,
      lib,
      pkgs,
      modulesPath,
      ...
    }:
    {
      imports = [
        (modulesPath + "/installer/scan/not-detected.nix")
      ];

      boot.initrd.availableKernelModules = [
        "nvme"
        "xhci_pci"
        "thunderbolt"
        "usb_storage"
        "sd_mod"
      ];
      boot.initrd.kernelModules = [ ];
      boot.kernelModules = [ "kvm-amd" ];
      boot.extraModulePackages = [ ];

      fileSystems."/" = {
        device = "/dev/mapper/luks-6833b3fb-677d-417e-8fd3-8fb55d0fba12";
        fsType = "ext4";
      };

      boot.initrd.luks.devices."luks-6833b3fb-677d-417e-8fd3-8fb55d0fba12".device =
        "/dev/disk/by-uuid/6833b3fb-677d-417e-8fd3-8fb55d0fba12";

      boot.initrd.luks.devices."luks-131a82b2-3093-4528-805f-b98ad2bc62ea".device =
        "/dev/disk/by-uuid/131a82b2-3093-4528-805f-b98ad2bc62ea";

      fileSystems."/boot" = {
        device = "/dev/disk/by-uuid/E275-F417";
        fsType = "vfat";
        options = [
          "fmask=0077"
          "dmask=0077"
        ];
      };

      swapDevices = [
        { device = "/dev/mapper/luks-131a82b2-3093-4528-805f-b98ad2bc62ea"; }
      ];

      nixpkgs.hostPlatform = lib.mkDefault "x86_64-linux";
      hardware.cpu.amd.updateMicrocode = lib.mkDefault config.hardware.enableRedistributableFirmware;
    };
}
