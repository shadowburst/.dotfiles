_: {
  flake.homeModules.cli =
    { pkgs, ... }:
    {
      # The official playwright-cli skill calls `playwright-cli`. nixpkgs ships the same CLI
      # as `playwright cli`, with PLAYWRIGHT_BROWSERS_PATH already set to the matching Nix
      # browsers. The default "chrome" channel needs /opt/google/chrome, so use Chromium.
      home.packages = [
        (pkgs.writeShellScriptBin "playwright-cli" ''
          export PLAYWRIGHT_MCP_BROWSER=''${PLAYWRIGHT_MCP_BROWSER:-chromium}
          exec ${pkgs.playwright-test}/bin/playwright cli "$@"
        '')
      ];
    };
}
