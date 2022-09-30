#   _____  _____ __  ______  ______
#  /__  / / ___// / / / __ \/ ____/
#    / /  \__ \/ /_/ / /_/ / /
#   / /_____/ / __  / _, _/ /___
#  /____/____/_/ /_/_/ |_|\____/

# Load theme
if [ -f ~/.config/zsh/.zsh_theme ]; then
    . ~/.config/zsh/.zsh_theme
fi

# Load ZSH plugin manager
. "${HOME}/.zgenom/zgenom.zsh"

zgenom autoupdate

if ! zgenom saved; then

    zgenom load jeffreytse/zsh-vi-mode
    zgenom load romkatv/powerlevel10k powerlevel10k
    zgenom load zsh-users/zsh-autosuggestions
    zgenom load zsh-users/zsh-history-substring-search
    zgenom load zsh-users/zsh-syntax-highlighting

    zgenom save
fi
zstyle ':completion:*' menu select

setopt complete_aliases

# Keep history
HISTFILE="$ZDOTDIR/.zsh_history"
SAVEHIST=1000
HISTSIZE=999
setopt APPEND_HISTORY
setopt SHARE_HISTORY
setopt HIST_EXPIRE_DUPS_FIRST
setopt EXTENDED_HISTORY

# Keybindings
function init_keymaps() {
    # Fix history bindings
    bindkey '^[[A' history-substring-search-up
    bindkey '^[[B' history-substring-search-down

    # Easy kill word
    bindkey '^H' backward-kill-word
    bindkey '^[[3;5~' kill-word

    # Easy move cursor
    bindkey "^[[1;5C" forward-word
    bindkey "^[[1;5D" backward-word
}
zvm_after_init_commands+=(init_keymaps)

# Load aliases
if [ -f ~/.config/zsh/.zsh_aliases ]; then
    . ~/.config/zsh/.zsh_aliases
fi

# Load functions
if [ -f ~/.config/zsh/.zsh_functions ]; then
    . ~/.config/zsh/.zsh_functions
fi

# Load Node.js manager
eval "$(fnm env --use-on-cd)"

