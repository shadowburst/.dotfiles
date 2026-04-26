_: {
  flake.homeModules.ralphy =
    { lib, pkgs, ... }:
    let
      ralphy = pkgs.writeShellScriptBin "ralphy" (builtins.readFile ./scripts/ralphy);
    in
    {
      home.packages = [ ralphy ];
    };
}
