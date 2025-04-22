{pkgs, ...}: {
  home.packages = with pkgs; [
    onlyoffice-desktopeditors
    postman
    stripe-cli
  ];
}
