{...}: {
  programs.starship = {
    enable = true;
    enableFishIntegration = true;
    enableBashIntegration = true;
    settings = {
      right_format = "$time";
      time = {
        disabled = false;
        time_format = "%R";
        format = "[   $time ]($style)";
      };
    };
  };
}
