_: {
  flake.nixosModules.nas = {
    services.jellyfin = {
      enable = true;
      dataDir = "/srv/jellyfin";
      openFirewall = false;
      hardwareAcceleration = {
        enable = true;
        type = "vaapi";
        device = "/dev/dri/renderD128";
      };
      transcoding = {
        enableHardwareEncoding = true;
        # H.264 is the safe baseline until the exact AMD GPU is known.
        hardwareDecodingCodecs.h264 = true;
      };
    };

    systemd.services.jellyfin.serviceConfig.ReadOnlyPaths = [ "/srv/media" ];
    users.users.jellyfin.extraGroups = [
      "media"
      "render"
      "video"
    ];
    networking.firewall.interfaces.tailscale0.allowedTCPPorts = [ 8096 ];
  };
}
