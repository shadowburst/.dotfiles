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
    *.tar.xz|*.txz) tar -xJf "$archive" ;;
    *.tar.zst|*.tzst) tar --zstd -xf "$archive" ;;
    *.bz2) bunzip2 "$archive" ;;
    *.gz) gunzip "$archive" ;;
    *.xz) unxz "$archive" ;;
    *.zst) unzstd --rm "$archive" ;;
    *.tar) tar -xf "$archive" ;;
    *.zip) unzip "$archive" ;;
    *.Z) uncompress "$archive" ;;
    *) print -u2 -- "'$1' cannot be extracted via extract()"; return 1 ;;
  esac
}
