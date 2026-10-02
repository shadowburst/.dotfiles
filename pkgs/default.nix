_:
let
  mkCutaway = import ./cutaway.nix;
  mkPiWebAccess = import ./pi-web-access.nix;
  mkPiTasks = import ./pi-tasks.nix;
  mkPonytail = import ./ponytail.nix;

  mkPackages = { lib, pkgs }: {
    cutaway = mkCutaway { inherit lib pkgs; };
    pi-web-access = mkPiWebAccess { inherit pkgs; };
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
