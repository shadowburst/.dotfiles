{ pkgs, ... }:

{
  home.packages = with pkgs; [
    gitkraken
    postman
    stripe-cli
  ];
}
