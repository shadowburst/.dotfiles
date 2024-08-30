{ config, ... }:

{
  programs.fzf = {
    enable = true;
    enableFishIntegration = true;
    defaultOptions = [
      "--prompt=' '"
      "--pointer=''"
      "--header=''"
      "--no-info"
      "--border=rounded"
      "--preview-window=border-left"
      "--layout=reverse"
      "--highlight-line"
    ];
    colors = {
      bg = "#1e2030";
      "bg+" = "#2d3f76";
      gutter = "#1e2030";
      border = "#589ed7";
      header = "#ff966c";
      separator = "#ff966c";
      hl = "#65bcff";
      "hl+" = "#65bcff";
      fg = "#c8d3f5";
      query = "#c8d3f5:regular";
      marker = "#ff007c";
      pointer = "#ff007c";
      prompt = "#c099ff";
      scrollbar = "#589ed7";
      spinner = "#ff007c";
    };

    tmux = {
      enableShellIntegration = true;
    };
  };
}
