_:
let
  mkClickupCli = import ./clickup-cli.nix;
  mkTerminalBrowser = import ./terminal-browser.nix;
  mkPiWebAccess = import ./pi-web-access.nix;
  mkPiMcpAdapter = import ./pi-mcp-adapter.nix;
  mkPiTasks = import ./pi-tasks.nix;
  mkPonytail = import ./ponytail.nix;

  mkPackages = { lib, pkgs }: {
    clickup-cli = mkClickupCli { inherit lib pkgs; };
    terminal-browser = mkTerminalBrowser { inherit lib pkgs; };
    pi-web-access = mkPiWebAccess { inherit pkgs; };
    pi-mcp-adapter = mkPiMcpAdapter { inherit pkgs; };
    pi-tasks = mkPiTasks { inherit pkgs; };
    ponytail = mkPonytail { inherit pkgs; };
  };
in
{
  flake.overlays.default =
    final: _prev:
    mkPackages {
      lib = final.lib;
      pkgs = final;
    };

  perSystem =
    { lib, pkgs, ... }:
    {
      packages = mkPackages { inherit lib pkgs; };
    };
}
