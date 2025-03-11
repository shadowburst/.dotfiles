{
  config,
  lib,
  pkgs,
  ...
}: let
  tmux-sessionizer = pkgs.writeShellScriptBin "tmux-sessionizer" (
    lib.fileContents ./bin/tmux-sessionizer
  );
in {
  programs.tmux = {
    enable = true;
    baseIndex = 1;
    escapeTime = 0;
    mouse = true;
    terminal = "xterm-256color";
    extraConfig = with config.lib.stylix.colors.withHashtag; ''
      set -as terminal-features ",xterm-256color:RGB"

      # +--- Status bar ---+
      set -g status-position top
      set -g status-justify absolute-centre
      set -g status-style 'bg=${base00} fg=${base05}'

      set -g status-left-length 100
      set -g status-left "#[fg=${base0D},bg=${base00}]#[fg=${base00},bg=${base0D},bold] #S #[fg=${base0D},bg=${base00}]"

      set -g status-right-length 100
      set -g status-right "#[fg=${base0D},bg=${base00}]#[fg=${base00},bg=${base0D},bold]  %H:%M #[fg=${base0D},bg=${base00}]"

      set -g window-status-current-format "#[fg=${base0D},bg=${base00}]#[fg=${base00},bg=${base0D},bold]  #I #W #[fg=${base0D},bg=${base00}]"
      set -g window-status-format "#[fg=${base05},bg=${base00}]  #I #W "

      # +--- Borders ---+
      set -g pane-border-style "fg=${base03}"
      set -g pane-active-border-style "fg=${base0D}"

      # +--- Panes ---+
      set -g pane-border-status top
      set -g pane-border-format " #{pane_title} "

      # +--- Sessions ---+
      bind-key -n M-d detach
      bind-key -n M-f run-shell "tmux neww tmux-sessionizer"
      bind-key -n M-q confirm-before "kill-session"

      # +--- Windows ---+
      bind-key -n M-w choose-window
      bind-key -n M-Space next-window
      bind-key -n M-Tab switch-client -n
      bind-key -n M-n new-window
      bind-key -n M-s split-window -v
      bind-key -n M-v split-window -h
      bind-key -n M-H swap-pane -d -t "{left-of}"
      bind-key -n M-J swap-pane -d -t "{down-of}"
      bind-key -n M-K swap-pane -d -t "{up-of}"
      bind-key -n M-L swap-pane -d -t "{right-of}"

      # +--- Panes ---+
      bind-key -n M-c confirm-before "kill-pane"
      bind-key -n M-o confirm-before "kill-pane -a"

      # +--- Other ---+
      bind-key r source-file ~/.config/tmux/tmux.conf

      # +--- Vim integration ---+
      is_vim="ps -o state= -o comm= -t '#{pane_tty}' | grep -iqE '^[^TXZ ]+ +(\\S+\\/)?g?(view|n?vim?x?)(diff)?$'"

      bind-key -n C-h if-shell "$is_vim" "send-keys C-h" "select-pane -L"
      bind-key -n C-j if-shell "$is_vim" "send-keys C-j" "select-pane -D"
      bind-key -n C-k if-shell "$is_vim" "send-keys C-k" "select-pane -U"
      bind-key -n C-l if-shell "$is_vim" "send-keys C-l" "select-pane -R"

      bind-key -n "M-h" if-shell "$is_vim" "send-keys M-h" "resize-pane -L 1"
      bind-key -n "M-j" if-shell "$is_vim" "send-keys M-j" "resize-pane -D 1"
      bind-key -n "M-k" if-shell "$is_vim" "send-keys M-k" "resize-pane -U 1"
      bind-key -n "M-l" if-shell "$is_vim" "send-keys M-l" "resize-pane -R 1"
    '';
  };

  home.packages = [
    tmux-sessionizer
  ];

  home.file.".local/share/tmux/templates" = {
    source = ./templates;
    recursive = true;
  };
}
