_:
{
  flake.homeModules.work =
    { lib, pkgs, ... }:
    {
      home.packages = with pkgs; [
        onlyoffice-desktopeditors
        postman
        stripe-cli
      ];

    };
}
