{config, ...}: {
  programs.ghostty = {
    enable = true;
    settings = {
      font-family = with config.stylix; [
        fonts.monospace.name
        fonts.emoji.name
      ];
      font-size = 11;
      cursor-color = config.lib.stylix.colors.withHashtag.base07;
      background-opacity = 0.9;
      confirm-close-surface = false;
      window-padding-y = 2;
      window-padding-color = "extend";
      keybind = [
        "shift+enter=text:\\x1b\\r" # Send Alt+Enter
        "control+backspace=text:\\x1b\\x7f" # Send Alt+Backspace
      ];
      custom-shader = [
        "${./shaders/cursor_smear.glsl}"
      ];
    };
  };

  home.sessionVariables.TERMINAL = "ghostty";
}
