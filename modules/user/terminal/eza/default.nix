{ ... }:

{
  programs.eza = {
    enable = true;
    enableFishIntegration = true;
    git = true;
    icons = true;
    extraOptions = [
      "--group-directories-first"
      "--color=always"
    ];
  };
}
