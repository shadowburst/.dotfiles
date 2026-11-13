_:
let
  mkPonytail = import ./ponytail.nix;
  mkHerdrReviewr = import ./herdr-reviewr.nix;
  mkHerdrWorktree = import ./herdr-worktree;
  mkDbExport = import ./db-export.nix;

  mkPackages = { lib, pkgs }: rec {
    ponytail = mkPonytail { inherit pkgs; };
    herdr-reviewr = mkHerdrReviewr { inherit pkgs; };
    herdr-worktree = mkHerdrWorktree { inherit pkgs; };
    db-export = mkDbExport { inherit pkgs; };
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
