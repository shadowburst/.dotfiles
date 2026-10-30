ide() {
  if ! command -v herdr-app >/dev/null; then
    print -u2 -- 'ide: herdr-app is not installed'
    return 127
  fi
  local log="${XDG_STATE_HOME:-$HOME/.local/state}/herdr-app/launch.log"
  mkdir -p -- "${log:h}" || return
  herdr-app >>"$log" 2>&1 &!
  local attempt
  for attempt in {1..100}; do
    if herdr-app status >/dev/null 2>&1; then
      herdr-app do space.new --folder "$PWD"
      return $?
    fi
    sleep 0.1
  done
  print -u2 -- "ide: Herdr did not become ready; see $log"
  return 1
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
