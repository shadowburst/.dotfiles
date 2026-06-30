_:
let
  mkLerd = import ./lerd.nix;
  mkOrca = import ./orca.nix;

  mkPackages = { lib, pkgs }: {
    lerd = mkLerd { inherit lib pkgs; };
    orca = mkOrca { inherit lib pkgs; };
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
