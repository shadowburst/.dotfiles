_:
let
  mkClickupCli = import ./clickup-cli.nix;
  mkHerdrReviewr = import ./herdr-reviewr.nix;
  mkTerminalBrowser = import ./terminal-browser.nix;

  mkPackages = { lib, pkgs }: {
    clickup-cli = mkClickupCli { inherit lib pkgs; };
    herdr-reviewr = mkHerdrReviewr { inherit lib pkgs; };
    terminal-browser = mkTerminalBrowser { inherit lib pkgs; };
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
