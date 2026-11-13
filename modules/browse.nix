_: {
  flake.homeModules.cli =
    { pkgs, ... }:
    {
      home.packages = [ pkgs.browse ];

      programs.opencode.settings.mcp.servers.browse = {
        type = "local";
        command = [
          "${pkgs.browse}/bin/browse"
          "mcp"
        ];
      };
    };
}
