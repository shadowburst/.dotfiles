_:
let
  mkClickupCli = import ./clickup-cli.nix;

  mkPackages = { lib, pkgs }: {
    clickup-cli = mkClickupCli { inherit lib pkgs; };
  };
in
{
  flake.overlays.default = final: _prev: mkPackages {
    lib = final.lib;
    pkgs = final;
  };

  perSystem =
    { lib, pkgs, ... }:
    {
      packages = mkPackages { inherit lib pkgs; };
    };
}
