#!/usr/bin/env zsh

# Only update if docked
if [ "$(autorandr --current)" != "docked" ]; then
    exit 0;
fi

# Only run if gamemode is not running
if [ -n "$(gamemodelist)" ]; then
    exit 0;
fi


DATA_DIR="$HOME/.local/share/conky"
KEYBOARD_PERCENT="$DATA_DIR/keyboard_percent"
KEYBOARD_STATUS="$DATA_DIR/keyboard_status"
MOUSE_PERCENT="$DATA_DIR/mouse_percent"
MOUSE_STATUS="$DATA_DIR/mouse_status"

mkdir -p "$DATA_DIR"
touch "$KEYBOARD_PERCENT"
touch "$KEYBOARD_STATUS"
touch "$MOUSE_PERCENT"
touch "$MOUSE_STATUS"

solaar_output=$(solaar show)

keyboard_data=$(echo $solaar_output | awk '/MX Keys/{flag=1} flag; /^$/{flag=0}' | awk '/Battery:/ {gsub(/[^[:alnum:][:space:]]/, ""); print $2,$3; exit}')
echo $keyboard_data | awk '{print $1}' > "$KEYBOARD_PERCENT"
if [ $(echo $keyboard_data | awk '{print $2}') = 'charging' ]; then
    echo '' > "$KEYBOARD_STATUS"
else
    echo '' > "$KEYBOARD_STATUS"
fi

mouse_data=$(echo $solaar_output | awk '/MX Master 3S/{flag=1} flag; /^$/{flag=0}' | awk '/Battery:/ {gsub(/[^[:alnum:][:space:]]/, ""); print $2,$3; exit}')
echo $mouse_data | awk '{print $1}' > "$MOUSE_PERCENT"
if [ $(echo $mouse_data | awk '{print $2}') = 'charging' ]; then
    echo '' > "$MOUSE_STATUS"
else
    echo '' > "$MOUSE_STATUS"
fi
