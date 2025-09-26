{
  config,
  lib,
  pkgs,
  username,
  ...
}: let
  tmux-sessionizer = pkgs.writeShellScriptBin "tmux-sessionizer" (
    lib.fileContents ./bin/tmux-sessionizer
  );
in {
  programs.tmux = {
    enable = true;
    baseIndex = 1;
    prefix = "C-f";
    escapeTime = 0;
    mouse = true;
    keyMode = "vi";
    terminal = "xterm-256color";
    focusEvents = true;
    extraConfig = ''
      set -as terminal-features ",xterm-256color:RGB"

      # status left look and feel
      set -g status-left-length 100
      set -g status-left ""
      set -ga status-left "#{?client_prefix,#{#[bg=#{@thm_red},fg=#{@thm_bg},bold]   #S },#{#[bg=default,fg=#{@thm_red},bold]   #S }}"
      set -ga status-left "#[bg=default,fg=#{@thm_overlay_0},none,bold]│"
      set -ga status-left "#[bg=default,fg=#{@thm_green},bold]   #W "
      set -ga status-left "#[bg=default,fg=#{@thm_overlay_0},none,bold]#{?window_zoomed_flag,│,}"
      set -ga status-left "#[bg=default,fg=#{@thm_yellow},bold]#{?window_zoomed_flag,   zoom ,}"

      # status right look and feel
      set -g status-right-length 100
      set -g status-right ""

      # Configure Tmux
      set -g status-position top
      set -g status-style "bg=default"
      set -g status-justify "absolute-centre"

      # pane border look and feel
      setw -g pane-border-status top
      setw -g pane-border-format ""
      setw -g pane-border-style "bg=default,fg=#{@thm_overlay_0}"
      setw -g pane-active-border-style "bg=default,fg=#{@thm_mauve}"
      setw -g pane-border-lines single

      # window style
      set -g window-status-format " #I "
      set -g window-status-current-format " #I "
      set -g window-status-style "bg=default,fg=#{@thm_lavender}"
      set -g window-status-last-style "bg=default,fg=#{@thm_lavender}"
      set -g window-status-current-style "bg=#{@thm_bg},fg=#{@thm_mauve},bold"
      set -g window-status-activity-style "bg=default,fg=#{@thm_sapphire},bold"
      set -g window-status-bell-style "bg=default,fg=#{@thm_red},bold"
      set -gF window-status-separator "#[bg=default,fg=#{@thm_overlay_2}]│"

      # +--- Sessions ---+
      bind-key -n M-d detach
      bind-key -n M-Tab switch-client -n
      bind-key -n M-Space run-shell "tmux neww tmux-sessionizer"

      # +--- Windows ---+
      bind-key w choose-window
      bind-key -n M-t new-window
      bind-key -n M-p previous-window
      bind-key -n M-n next-window
      bind-key -n M-s split-window -v
      bind-key -n M-v split-window -h

      bind-key '&' select-window -t 1
      bind-key 'é' select-window -t 2
      bind-key '"' select-window -t 3
      bind-key "'" select-window -t 4
      bind-key '(' select-window -t 5
      bind-key '-' select-window -t 6
      bind-key 'è' select-window -t 7
      bind-key '_' select-window -t 8
      bind-key 'ç' select-window -t 9

      # +--- Panes ---+
      bind-key -n M-q confirm-before "kill-pane"
      bind-key -n M-o confirm-before "kill-pane -a"
      bind-key -n M-f resize-pane -Z

      # +--- Copy mode ---+
      bind-key -T copy-mode-vi v send-keys -X begin-selection
      bind-key -T copy-mode-vi Escape send-keys -X cancel
      bind-key -n M-Escape copy-mode

      # +--- Other ---+
      bind-key -n M-r source-file ~/.config/tmux/tmux.conf

      # +--- Vim integration ---+
      is_vim="ps -o state= -o comm= -t '#{pane_tty}' | grep -iqE '^[^TXZ ]+ +(\\S+\\/)?g?(view|n?vim?x?)(diff)?$'"

      bind-key -n C-h if-shell "$is_vim" "send-keys C-h" "select-pane -L"
      bind-key -n C-j if-shell "$is_vim" "send-keys C-j" "select-pane -D"
      bind-key -n C-k if-shell "$is_vim" "send-keys C-k" "select-pane -U"
      bind-key -n C-l if-shell "$is_vim" "send-keys C-l" "select-pane -R"

      bind-key -n M-h if-shell "$is_vim" "send-keys M-h" "resize-pane -L 3"
      bind-key -n M-j if-shell "$is_vim" "send-keys M-j" "resize-pane -D 3"
      bind-key -n M-k if-shell "$is_vim" "send-keys M-k" "resize-pane -U 3"
      bind-key -n M-l if-shell "$is_vim" "send-keys M-l" "resize-pane -R 3"


      bind-key -n M-H swap-pane -d -t "{left-of}"
      bind-key -n M-J swap-pane -d -t "{down-of}"
      bind-key -n M-K swap-pane -d -t "{up-of}"
      bind-key -n M-L swap-pane -d -t "{right-of}"
    '';
  };

  home.packages = [tmux-sessionizer];

  xdg.stateFile."${username}/tmux/templates" = {
    source = ./templates;
    recursive = true;
  };
}
