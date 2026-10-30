_:
let
  mkPiWebAccess = import ./pi-web-access.nix;
  mkPiTasks = import ./pi-tasks.nix;
  mkPonytail = import ./ponytail.nix;
  mkHerdrReviewr = import ./herdr-reviewr.nix;
  mkHerdrCore = import ./herdr-core.nix;
  mkHerdrDesktop = import ./herdr-desktop.nix;

  mkPackages = { lib, pkgs }: rec {
    pi-web-access = mkPiWebAccess { inherit pkgs; };
    pi-tasks = mkPiTasks { inherit pkgs; };
    ponytail = mkPonytail { inherit pkgs; };
    herdr-reviewr = mkHerdrReviewr { inherit pkgs; };
    herdr-core = mkHerdrCore { inherit pkgs; };
    herdr-desktop = mkHerdrDesktop { inherit pkgs herdr-core; };
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
