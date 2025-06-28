{config, ...}: {
  programs.ghostty = {
    enable = true;
    enableFishIntegration = true;
    settings = {
      font-family = with config.stylix; [
        fonts.monospace.name
        fonts.emoji.name
      ];
      font-size = 11;
      background-opacity = 0.9;
      confirm-close-surface = false;
      window-padding-y = 4;
    };
  };
}
