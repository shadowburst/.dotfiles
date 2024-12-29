{ pkgs, ... }:

{
  home.packages = with pkgs; [
    gitkraken
    onlyoffice-desktopeditors
    postman
    stripe-cli
  ];

  programs.fish.shellAbbrs = {
    sail = "./vendor/bin/sail";
  };
}
