_: {
  flake.homeModules.work =
    { pkgs, ... }:
    {
      home.packages = [ pkgs.clickup-cli ];
    };
}
