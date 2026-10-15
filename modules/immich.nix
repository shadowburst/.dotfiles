_: {
  flake.nixosModules.nas = {
    services.immich = {
      enable = true;
      host = "0.0.0.0";
      mediaLocation = "/srv/immich";
      openFirewall = false;
      accelerationDevices = [ "/dev/dri/renderD128" ];
      settings.ffmpeg = {
        accel = "vaapi";
        accelDecode = true;
      };
    };

    users.users.immich.extraGroups = [
      "render"
      "video"
    ];
    systemd.tmpfiles.rules = [ "d /srv/immich 0700 immich immich -" ];
    networking.firewall.interfaces.tailscale0.allowedTCPPorts = [ 2283 ];
  };
}
