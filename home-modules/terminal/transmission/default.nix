{ config, pkgs, ... }:

{
  home.packages = with pkgs; [
    transmission_4
  ];

  xdg.configFile."transmission-daemon/settings.json".text = ''
    {
      "alt-speed-down": 50,
      "alt-speed-enabled": false,
      "alt-speed-time-begin": 540,
      "alt-speed-time-day": 127,
      "alt-speed-time-enabled": false,
      "alt-speed-time-end": 1020,
      "alt-speed-up": 50,
      "bind-address-ipv4": "0.0.0.0",
      "bind-address-ipv6": "::",
      "blocklist-enabled": true,
      "blocklist-url": "https://github.com/Naunter/BT_BlockLists/raw/master/bt_blocklists.gz",
      "cache-size-mb": 4,
      "dht-enabled": true,
      "download-dir": "${config.home.homeDirectory}/Videos",
      "download-queue-enabled": true,
      "download-queue-size": 4,
      "encryption": 1,
      "idle-seeding-limit": 30,
      "idle-seeding-limit-enabled": false,
      "incomplete-dir": "${config.home.homeDirectory}/Downloads",
      "incomplete-dir-enabled": false,
      "lazy-bitfeild-enabled": true,
      "lpd-enabled": false,
      "message-level": 1,
      "peer-congestion-algorithm": "",
      "peer-forwarding-enabled": true,
      "peer-id-ttl-hours": 6,
      "peer-limit-global": 240,
      "peer-limit-per-torrent": 60,
      "peer-port": 51413,
      "peer-port-random-high": 65535,
      "peer-port-random-low": 1024,
      "peer-port-random-on-start": false,
      "peer-socket-tos": "default",
      "pex-enabled": true,
      "port-forwarding-enabled": true,
      "preallocation": 1,
      "prefetch-enabled": true,
      "queue-stalled-enabled": true,
      "queue-stalled-minutes": 30,
      "ratio-limit": 2,
      "ratio-limit-enabled": false,
      "rename-partial-files": true,
      "rpc-authentication-required": false,
      "rpc-bind-address": "0.0.0.0",
      "rpc-enabled": true,
      "rpc-host-whitelist": "",
      "rpc-host-whitelist-enabled": true,
      "rpc-password": "{0b6f859e9f996e5c1910ea0561010ad4f4d9cd8ffB99blR6",
      "rpc-port": 9091,
      "rpc-url": "/transmission/",
      "rpc-username": "",
      "rpc-whitelist": "127.0.0.1",
      "rpc-whitelist-enabled": true,
      "scrape-paused-torrents-enabled": true,
      "script-torrent-done-enabled": true,
      "script-torrent-done-filename": "${config.home.homeDirectory}/.config/transmission-daemon/scripts/torrent-done.sh",
      "seed-queue-enabled": true,
      "seed-queue-size": 5,
      "speed-limit-down": 5000,
      "speed-limit-down-enabled": true,
      "speed-limit-up": 150,
      "speed-limit-up-enabled": true,
      "start-added-torrents": true,
      "trash-original-torrent-files": true,
      "umask": 18,
      "upload-slots-per-torrent": 14,
      "utp-enabled": true,
      "watch-dir": "${config.home.homeDirectory}/Downloads",
      "watch-dir-enabled": true
    }
  '';

  xdg.configFile."transmission-daemon/scripts" = {
    source = ./scripts;
    recursive = true;
  };

  xdg.desktopEntries.transmission-magnet = {
    name = "Transmission (magnet)";
    type = "Application";
    noDisplay = true;
    comment = "Add magnet link to transmission";
    exec = "transmission-remote -a %u";
    mimeType = [ "x-scheme-handler/magnet" ];
  };
}
