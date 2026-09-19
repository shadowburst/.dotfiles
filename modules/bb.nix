_: {
  flake.homeModules.cli =
    { config, pkgs, ... }:
    {
      home.packages = [ pkgs.bb-app ];

      systemd.user.services.bb = {
        Unit.Description = "bb agentic IDE server and host daemon";

        Service = {
          Environment = [
            "BB_SERVER_BIND_HOST=127.0.0.1"
            "BB_TELEMETRY=false"
            "PATH=${config.home.profileDirectory}/bin:/run/current-system/sw/bin:/run/wrappers/bin"
          ];
          ExecStart = "${pkgs.bb-app}/bin/bb-app";
          Restart = "on-failure";
          RestartSec = 5;
          TimeoutStopSec = 20;
        };

        Install.WantedBy = [ "default.target" ];
      };
    };

  flake.homeModules.gui =
    { pkgs, ... }:
    {
      home.packages = [ pkgs.bb-desktop ];
    };
}
