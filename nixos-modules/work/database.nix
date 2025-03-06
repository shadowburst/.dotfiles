{
  config,
  pkgs,
  ...
}: let
  network = "database-bridge";
in {
  virtualisation.oci-containers = {
    backend = "docker";
    containers = {
      # mysql = {
      #   image = "mysql:lts";
      #   ports = ["3305:3306"];
      #   extraOptions = [
      #     "--network=${network}"
      #   ];
      #   environment = {
      #     MYSQL_ALLOW_EMPTY_PASSWORD = "1";
      #   };
      #   volumes = [
      #     "mysqldb:/var/lib/mysql"
      #   ];
      # };
      mariadb = {
        image = "mariadb:lts";
        ports = ["3306:3306"];
        extraOptions = [
          "--network=${network}"
        ];
        environment = {
          MARIADB_ALLOW_EMPTY_ROOT_PASSWORD = "1";
        };
        volumes = [
          "mariadbdb:/var/lib/mysql"
        ];
      };
      phpmyadmin = {
        image = "phpmyadmin:latest";
        ports = ["8001:80"];
        labels = {
          "traefik.http.routers.phpmyadmin.rule" = "Host(`phpmyadmin.localhost`)";
        };
        extraOptions = [
          "--network=${network}"
        ];
        dependsOn = [
          # "mysql"
          "mariadb"
        ];
        environment = {
          PMA_HOST = "mariadb";
          # PMA_HOSTS = "mariadb,mysql";
          PMA_USER = "root";
          UPLOAD_LIMIT = "1G";
        };
      };
    };
  };

  systemd.services.create-docker-network = with config.virtualisation.oci-containers; {
    serviceConfig.Type = "oneshot";
    wantedBy = ["${backend}-phpmyadmin.service"];
    script = "${pkgs.docker}/bin/docker network inspect ${network} >/dev/null 2>&1 || ${pkgs.docker}/bin/docker network create --driver bridge ${network}";
  };
}
