_: {
  flake.homeModules.lenovo-p14s =
    { pkgs, ... }:
    {
      home.packages = [ pkgs.clickup-cli ];
    };
}
