{ config, pkgs, ... }:

let
  network = "docker_local";
in
{
  virtualisation.oci-containers = {
    backend = "docker";
    containers = {
      mysql = {
        image = "mariadb:latest";
        ports = [ "3306:3306" ];
        extraOptions = [
          "--network=${network}"
        ];
        environment = {
          MARIADB_ALLOW_EMPTY_ROOT_PASSWORD = "1";
        };
        volumes = [
          "db:/var/lib/mysql"
        ];
      };
      phpmyadmin = {
        image = "phpmyadmin:latest";
        ports = [ "8080:80" ];
        extraOptions = [
          "--network=${network}"
        ];
        dependsOn = [
          "mysql"
        ];
        environment = {
          PMA_HOST = "mysql";
          PMA_USER = "root";
          UPLOAD_LIMIT = "1G";
        };
      };
    };
  };

  systemd.services.create-docker-network = with config.virtualisation.oci-containers; {
    serviceConfig.Type = "oneshot";
    wantedBy = [ "${backend}-phpmyadmin.service" ];
    script = "${pkgs.docker}/bin/docker network inspect ${network} >/dev/null 2>&1 || ${pkgs.docker}/bin/docker network create --driver bridge ${network}";
  };
}
