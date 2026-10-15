{ self, ... }:
{
  flake.nixosModules.nas = {
    users.groups.media = { };
    users.users.${self.username}.extraGroups = [ "media" ];

    systemd.tmpfiles.rules = [
      "d /srv/media 2770 ${self.username} media -"
      "d /srv/media/movies 2770 ${self.username} media -"
      "d /srv/media/tv 2770 ${self.username} media -"
    ];
  };
}
