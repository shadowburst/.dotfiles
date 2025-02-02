{config, ...}: {
  programs.fzf = {
    enable = true;
    enableFishIntegration = true;
    defaultOptions = [
      "--prompt=' '"
      "--pointer=''"
      "--header=''"
      "--border=rounded"
      "--preview-window=border-left"
      "--layout=reverse"
      "--highlight-line"
    ];
    colors = with config.lib.stylix.colors.withHashtag; {
      bg = base00;
      "bg+" = base03;
      gutter = base00;
      border = base0D;
      header = base09;
      info = base04;
      separator = base0D;
      hl = base0D;
      "hl+" = base0D;
      fg = base05;
      "fg+" = base05;
      query = "${base05}:regular";
      marker = base08;
      pointer = base08;
      prompt = base0F;
      scrollbar = base0D;
      spinner = base08;
    };
    tmux = {
      enableShellIntegration = true;
    };
  };
}
