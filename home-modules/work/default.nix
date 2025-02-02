{pkgs, ...}: {
  home.packages = with pkgs; [
    gitkraken
    onlyoffice-desktopeditors
    postman
    stripe-cli
  ];
}
