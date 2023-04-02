set TERM "xterm-256color"

set fish_greeting
set fish_color_command green
set fish_color_param foreground
set fish_color_option cyan
set fish_color_error red

function fish_user_key_bindings
  fish_vi_key_bindings
end

alias grep="grep --color=always"

alias ll='exa --icons --group-directories-first --color=always -la'
alias lt='exa --icons --group-directories-first --color=always -T'

# Confirm dangerous actions
alias cp='cp -i'
alias mv='mv -i'
alias rm='rm -i'

# Create directories recursively
alias mkdir='mkdir -p'

# Emacs
alias emacsclient='emacsclient -c -a "emacs"'
alias emacsterm='emacsclient -t'

# Aur helper
alias yay='paru'

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

function test_desktop
    Xephyr -ac -nolisten tcp -br -noreset -screen 1280x800 :1 &; sleep 1; DISPLAY=:1.0 $argv
end

starship init fish | source
