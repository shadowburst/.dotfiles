_:
{
  flake.homeModules.images =
    { lib, pkgs, ... }:
    {
      home.file.".face".source = ./face.jpg;

      home.file."Pictures/Wallpapers" = {
        source = ./wallpapers;
        recursive = true;
      };
    };
}
