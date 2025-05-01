{pkgs, ...}: {
  imports = [
    ./cosmic
    ./kitty.nix
    ./mpv.nix
    ./transmission.nix
  ];

  home.sessionVariables = {
    BROWSER = "brave";
  };

  home.packages = with pkgs; [
    brave
    discord
    # ente-auth
    gimp3
    pdfarranger
    simple-scan
  ];
}
