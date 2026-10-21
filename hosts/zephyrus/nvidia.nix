_: {
  flake.nixosModules.zephyrus =
    {
      config,
      pkgs,
      lib,
      ...
    }:
    with pkgs;
    let
      nvidiaPowerd = pkgs.runCommand "nvidia-powerd" { nativeBuildInputs = [ pkgs.patchelf ]; } ''
        cp ${lib.getBin config.hardware.nvidia.package}/origBin/nvidia-powerd $out
        chmod u+w $out
        # shortcut: patchelf 0.19.2 corrupts this binary when sorting headers; remove when fixed upstream.
        patchelf --no-sort \
          --set-interpreter ${pkgs.stdenv.cc.bintools.dynamicLinker} \
          --set-rpath "$(patchelf --print-rpath ${lib.getBin config.hardware.nvidia.package}/bin/nvidia-powerd)" \
          $out
      '';
      patchDesktop =
        pkg: appName: from: to:
        lib.hiPrio (
          pkgs.runCommand "$patched-desktop-entry-for-${appName}" { } ''
            ${coreutils}/bin/mkdir -p $out/share/applications
            ${gnused}/bin/sed 's#${from}#${to}#g' < ${pkg}/share/applications/${appName}.desktop > $out/share/applications/${appName}.desktop
          ''
        );
      GPUOffloadApp =
        pkg: desktopName:
        lib.mkIf config.hardware.nvidia.prime.offload.enable (
          patchDesktop pkg desktopName "^Exec=" "Exec=nvidia-offload "
        );
    in
    {
      environment.systemPackages = with pkgs; [
        (GPUOffloadApp steam "steam")
      ];

      hardware = {
        nvidia = {
          open = true;
          dynamicBoost.enable = true;
          powerManagement = {
            enable = true;
            finegrained = true;
          };
        };
      };

      systemd.services.nvidia-powerd.serviceConfig.ExecStart = lib.mkForce "${nvidiaPowerd}";

      services.xserver.videoDrivers = [
        "amdgpu"
        "nvidia"
      ];

      services.udev.extraRules = ''
        KERNEL=="card*", KERNELS=="0000:65:00.0", SUBSYSTEM=="drm", SUBSYSTEMS=="pci", SYMLINK+="dri/amd-igpu"
        KERNEL=="card*", KERNELS=="0000:01:00.0", SUBSYSTEM=="drm", SUBSYSTEMS=="pci", SYMLINK+="dri/nvidia-dgpu"
      '';
    };
}
