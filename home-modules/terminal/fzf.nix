{ ... }:
{
  programs.fzf = {
    enable = true;
    defaultOptions = [
      "--prompt=' '"
      "--pointer=''"
      "--header=''"
      "--border=rounded"
      "--preview-window=border-left"
      "--layout=reverse"
      "--highlight-line"
    ];
  };
}
