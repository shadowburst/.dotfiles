ide() {
  "$TERMINAL" -e "$EDITOR" >/dev/null 2>&1 &!
}

extract() {
  if (( $# != 1 )); then
    print -u2 -- 'usage: extract <archive>'
    return 1
  fi
  if [[ ! -f $1 ]]; then
    print -u2 -- "'$1' is not a valid file"
    return 1
  fi

  # Absolute paths keep option-like filenames safe for every extractor.
  local archive=${1:a}
  case $archive in
    *.tar.bz2|*.tbz2) tar -xjf "$archive" ;;
    *.tar.gz|*.tgz) tar -xzf "$archive" ;;
    *.bz2) bunzip2 "$archive" ;;
    *.rar) rar x "$archive" ;;
    *.gz) gunzip "$archive" ;;
    *.tar) tar -xf "$archive" ;;
    *.zip) unzip "$archive" ;;
    *.Z) uncompress "$archive" ;;
    *) print -u2 -- "'$1' cannot be extracted via extract()"; return 1 ;;
  esac
}
