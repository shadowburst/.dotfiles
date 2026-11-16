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

      programs.claude-code.mcpServers.browse = {
        command = "${pkgs.browse}/bin/browse";
        args = [ "mcp" ];
      };

      programs.codex.settings.mcp_servers.browse = {
        command = "${pkgs.browse}/bin/browse";
        args = [ "mcp" ];
      };
    };
}
