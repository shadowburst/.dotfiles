_: {
  flake.nixosModules.nas = {
    systemd.tmpfiles.rules = [ "d /etc/nas 0700 root root -" ];
  };
}
