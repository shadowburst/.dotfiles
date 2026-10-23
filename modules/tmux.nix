_: {
  flake.homeModules.cli =
    { config, ... }:
    let
      colors = config.catppuccin.palette.colors;
    in
    {
      programs.tmux = {
        enable = true;
        baseIndex = 1;
        prefix = "C-b";
        escapeTime = 0;
        mouse = true;
        keyMode = "vi";
        terminal = "tmux-256color";
        focusEvents = true;
        historyLimit = 10000;
        extraConfig = ''
          set -g allow-passthrough on
          set -s extended-keys on
          set -s extended-keys-format csi-u
          set -as terminal-features ",xterm-kitty:RGB:extkeys,ghostty:RGB:extkeys,xterm-256color:RGB"
          set -ag update-environment " AGENT EDITOR"
          set -g status-position top
          set -g status-style "fg=${colors.overlay1.hex},bg=${colors.mantle.hex}"
          set -g status-left-length 100
          set -g status-left " #[fg=${colors.surface0.hex}]#[fg=${colors.lavender.hex},bg=${colors.surface0.hex},bold]#S#[fg=${colors.surface0.hex},bg=${colors.mantle.hex},nobold]#[default] "
          set -g status-right "#{?window_zoomed_flag, zoom ,}"
          setw -g window-status-current-style none
          set -g renumber-windows on

          setw -g pane-border-status top
          setw -g pane-border-format ""
          setw -g pane-border-style "bg=default,fg=${colors.surface1.hex}"
          setw -g pane-active-border-style "bg=default,fg=${colors.mauve.hex}"
          setw -g pane-border-lines single
          set -g main-pane-width 50%

          bind-key -n S-Enter send-keys Escape "[13;2u"

          # Sessions
          bind-key -n M-a confirm-before "kill-session -a"
          bind-key -n M-d detach
          bind-key -n M-r source-file ~/.config/tmux/tmux.conf
          bind-key -n M-Space display-popup -h 90% -w 80% -E "tv sesh"
          bind-key -n M-Tab run-shell "sesh last"
          bind-key -n M-w display-popup -B -h 100% -w 100% -d "#{pane_current_path}" -E "workmux dashboard"

          # Windows
          bind-key -n M-n next-window
          bind-key -n M-p previous-window
          bind-key -n M-t new-window -c "#{pane_current_path}"
          bind-key -n M-Enter {
            split-window -v -c "#{pane_current_path}"
            select-layout main-vertical
          }

          bind-key -n M-1 select-window -t 1
          bind-key -n M-2 select-window -t 2
          bind-key -n M-3 select-window -t 3
          bind-key -n M-4 select-window -t 4
          bind-key -n M-5 select-window -t 5
          bind-key -n M-6 select-window -t 6
          bind-key -n M-7 select-window -t 7
          bind-key -n M-8 select-window -t 8
          bind-key -n M-9 select-window -t 9
          bind-key '&' select-window -t 1
          bind-key 'é' select-window -t 2
          bind-key '"' select-window -t 3
          bind-key "'" select-window -t 4
          bind-key '(' select-window -t 5
          bind-key '-' select-window -t 6
          bind-key 'è' select-window -t 7
          bind-key '_' select-window -t 8
          bind-key 'ç' select-window -t 9

          # Panes
          bind-key -n M-b run-shell "workmux sidebar"
          bind-key -n M-! break-pane -d
          bind-key -n M-f resize-pane -Z
          bind-key -n M-o confirm-before "kill-pane -a"
          bind-key -n M-q {
            kill-pane
            select-layout main-vertical
          }
          bind-key -n M-x confirm-before "kill-session"
          bind-key -n M-Escape run-shell -C 'display-popup -B -h 100% -w 100% -e TMUX_PANE=#{pane_id} -E "nvim -c \"lua require[[tmux-scrollback]](vim.env.TMUX_PANE)\""'

          # smart-splits' tmux backend marks the pane while Neovim owns it.
          bind-key -n C-h if-shell -F '#{@pane-is-vim}' "send-keys C-h" "select-pane -L"
          bind-key -n C-j if-shell -F '#{@pane-is-vim}' "send-keys C-j" "select-pane -D"
          bind-key -n C-k if-shell -F '#{@pane-is-vim}' "send-keys C-k" "select-pane -U"
          bind-key -n C-l if-shell -F '#{@pane-is-vim}' "send-keys C-l" "select-pane -R"
          bind-key -n M-h if-shell -F '#{@pane-is-vim}' "send-keys M-h" "resize-pane -L 3"
          bind-key -n M-j if-shell -F '#{@pane-is-vim}' "send-keys M-j" "resize-pane -D 3"
          bind-key -n M-k if-shell -F '#{@pane-is-vim}' "send-keys M-k" "resize-pane -U 3"
          bind-key -n M-l if-shell -F '#{@pane-is-vim}' "send-keys M-l" "resize-pane -R 3"
          bind-key -n M-H swap-pane -d -t "{left-of}"
          bind-key -n M-J swap-pane -d -t "{down-of}"
          bind-key -n M-K swap-pane -d -t "{up-of}"
          bind-key -n M-L swap-pane -d -t "{right-of}"
        '';
      };
    };
}
