{
  inputs,
  pkgs,
  ...
}: {
  environment.systemPackages = [
    inputs.quickshell.packages.${pkgs.stdenv.hostPlatform.system}.default
  ];

  qt.enable = true;
}
