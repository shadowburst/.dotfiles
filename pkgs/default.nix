_:
let
  mkPiWebAccess = import ./pi-web-access.nix;
  mkPiTasks = import ./pi-tasks.nix;
  mkPiClaudeCode = import ./pi-claude-code.nix;
  mkPonytail = import ./ponytail.nix;
  mkHerdrReviewr = import ./herdr-reviewr.nix;
  mkHerdrWorktree = import ./herdr-worktree;
  mkDbExport = import ./db-export.nix;

  mkPackages = { lib, pkgs }: rec {
    pi-web-access = mkPiWebAccess { inherit pkgs; };
    pi-tasks = mkPiTasks { inherit pkgs; };
    pi-claude-code = mkPiClaudeCode { inherit pkgs; };
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
