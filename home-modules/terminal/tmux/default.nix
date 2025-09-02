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
    escapeTime = 250;
    mouse = true;
    keyMode = "vi";
    terminal = "xterm-256color";
    extraConfig = with config.lib.stylix.colors.withHashtag; ''
      set -as terminal-features ",xterm-256color:RGB"

      # +--- Status bar ---+
      set -g status-position top
      set -g status-justify absolute-centre
      set -g status-style 'bg=${base00} fg=${base05}'

      set -g status-left-length 100
      set -g status-left "#[fg=${base00},bg=${base07},bold] #S #[fg=${base07},bg=${base00}]"

      set -g status-right-length 100
      set -g status-right "#[fg=${base07},bg=${base00}]#[fg=${base00},bg=${base07},bold]  %H:%M "

      set -g window-status-current-format "#[fg=${base07},bg=${base00}]#[fg=${base00},bg=${base07},bold]  #I #W #[fg=${base07},bg=${base00}]"
      set -g window-status-format "#[fg=${base05},bg=${base00}]  #I #W "

      # +--- Borders ---+
      set -g pane-border-style "fg=${base03}"
      set -g pane-active-border-style "fg=${base07}"

      # +--- Panes ---+
      set -g pane-border-status top
      set -g pane-border-format " #{pane_title} "

      # +--- Sessions ---+
      bind-key d detach
      bind-key f run-shell "tmux neww tmux-sessionizer"
      bind-key q confirm-before "kill-session"
      bind-key Space switch-client -n

      # +--- Windows ---+
      bind-key w choose-window
      bind-key t new-window
      bind-key s split-window -v
      bind-key v split-window -h
      bind-key H swap-pane -d -t "{left-of}"
      bind-key J swap-pane -d -t "{down-of}"
      bind-key K swap-pane -d -t "{up-of}"
      bind-key L swap-pane -d -t "{right-of}"

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
      bind-key c confirm-before "kill-pane"
      bind-key o confirm-before "kill-pane -a"

      # +--- Copy mode ---+
      bind-key -T copy-mode-vi v send-keys -X begin-selection
      bind-key Escape copy-mode

      # +--- Other ---+
      bind-key r source-file ~/.config/tmux/tmux.conf

      # +--- Vim integration ---+
      is_vim="ps -o state= -o comm= -t '#{pane_tty}' | grep -iqE '^[^TXZ ]+ +(\\S+\\/)?g?(view|n?vim?x?)(diff)?$'"

      bind-key -n C-h if-shell "$is_vim" "send-keys C-h" "select-pane -L"
      bind-key -n C-j if-shell "$is_vim" "send-keys C-j" "select-pane -D"
      bind-key -n C-k if-shell "$is_vim" "send-keys C-k" "select-pane -U"
      bind-key -n C-l if-shell "$is_vim" "send-keys C-l" "select-pane -R"

      # +--- Toggle vertical pane to the right ---+
      bind-key | if-shell "tmux list-panes -F '#{pane_title}' | grep -q '^side-pane$'" "kill-pane -t \"=side-pane\"" "split-window -h -c '#{pane_current_path}' -T side-pane"
    '';
  };

  home.packages = [tmux-sessionizer];

  xdg.stateFile."${username}/tmux/templates" = {
    source = ./templates;
    recursive = true;
  };
}
