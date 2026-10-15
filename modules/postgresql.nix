_: {
  flake.nixosModules.nas =
    { config, pkgs, ... }:
    {
      services.postgresql = {
        package = pkgs.postgresql_17;
        dataDir = "/srv/postgresql/${config.services.postgresql.package.psqlSchema}";
        enableTCPIP = false;
      };
    };
}
