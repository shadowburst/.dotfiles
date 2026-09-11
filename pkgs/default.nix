_:
let
  mkClickupCli = import ./clickup-cli.nix;
  mkHerdrAutomaticRename = import ./herdr-automatic-rename.nix;
  mkHerdrReviewr = import ./herdr-reviewr.nix;

  mkPackages = { lib, pkgs }: {
    clickup-cli = mkClickupCli { inherit lib pkgs; };
    herdr-automatic-rename = mkHerdrAutomaticRename { inherit lib pkgs; };
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
