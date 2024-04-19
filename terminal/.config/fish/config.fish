set TERM xterm-256color

set fish_greeting
set fish_color_command green
set fish_color_param foreground
set fish_color_option cyan
set fish_color_error red
set -U fish_user_paths ~/.local/bin $fish_user_paths
if test -d ~/go/bin
    set -U fish_user_paths ~/go/bin $fish_user_paths
end

function fish_user_key_bindings
    fish_vi_key_bindings
end

# Always color output
alias grep="grep --color=always"

# Better listing files
alias ll='exa --icons --group-directories-first --color=always -la'
alias lt='exa --icons --group-directories-first --color=always -T'

# Better previewing contents
alias cat='bat --color=always --plain'

# Confirm dangerous actions
alias cp='cp -i'
alias mv='mv -i'
alias rm='rm -i'

# Create directories recursively
alias mkdir='mkdir -p'

# Extract all files based on type
function extract
    if test -f $argv
        switch $argv
            case "*.tar.bz2"
                tar xjf $argv
            case "*.tar.gz"
                tar xzf $argv
            case "*.bz2"
                bunzip2 $argv
            case "*.rar"
                rar x $argv
            case "*.gz"
                gunzip $argv
            case "*.tar"
                tar xf $argv
            case "*.tbz2"
                tar xjf $argv
            case "*.tgz"
                tar xzf $argv
            case "*.zip"
                unzip $argv
            case "*.Z"
                uncompress $argv
            case "*"
                echo "'$argv' cannot be extracted via extract()"
        end
    else
        echo "'$argv' is not a valid file"
    end
end

fzf --fish | source
zoxide init fish | source
starship init fish | source
