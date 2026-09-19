{ inputs, ... }:
let
  mkClickupCli = import ./clickup-cli.nix;
  mkHerdrReviewr = import ./herdr-reviewr.nix;

  mkPackages =
    { lib, pkgs }:
    let
      bb = pkgs.callPackage ./bb.nix { src = inputs.bb-src; };
    in
    {
      bb-app = bb;
      bb-desktop = bb;
      clickup-cli = mkClickupCli { inherit lib pkgs; };
      herdr-reviewr = mkHerdrReviewr { inherit lib pkgs; };
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
