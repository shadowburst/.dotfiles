(setq doom-theme 'doom-one)

(setq doom-font (font-spec :family "JetBrainsMono Nerd Font Mono" :size 14)
      doom-big-font (font-spec :family "JetBrainsMono Nerd Font Mono" :size 24)
      doom-unicode-font (font-spec :family "JetBrainsMono Nerd Font Mono")
      doom-variable-pitch-font (font-spec :family "Roboto"))
(after! doom-themes
  (setq doom-themes-enable-bold t
        doom-themes-enable-italic t))
(custom-set-faces!
  '(font-lock-comment-face :slant italic)
  '(font-lock-keyword-face :slant italic))

(map! :n  "C-s" #'save-buffer
      :iv "C-s" (cmd! (save-buffer)
                      (evil-force-normal-state)))

(setq display-line-numbers-type 'relative)
(setq evil-escape-unordered-key-sequence t
      evil-split-window-below t
      evil-vsplit-window-right t)

(global-auto-revert-mode 1)
(setq global-auto-revert-non-file-buffers t)

(setq user-full-name "Peter Baudry")

(add-hook 'dired-mode-hook 'all-the-icons-dired-mode)

(setq delete-by-moving-to-trash t
      trash-directory "~/.local/share/Trash/files/")

(setq dired-open-extensions '(("gif" . "feh")
                              ("jpg" . "feh")
                              ("png" . "feh")
                              ("docx" . "onlyoffice")
                              ("pdf" . "brave")
                              ("mkv" . "mpv")
                              ("mp4" . "mpv")))

(setq ranger-cleanup-eagerly t
      ranger-show-hidden 'hidden
      ranger-preview-file nil)

(map! :after dired
    :map (dired-mode-map ranger-mode-map)
    :ng "a" #'dired-create-empty-file
    :ng "A" #'dired-create-directory
    :ng "l" #'dired-open-file)

(map! :leader
      :desc "Org babel tangle" "m B" #'org-babel-tangle)

(after! org
  (setq org-directory "~/.org"
        org-agenda-files '("~/.org/agenda.org")
        org-default-notes-file (expand-file-name "notes.org" org-directory)
        org-ellipsis " ▼ "
        org-superstar-headline-bullets-list '("◉" "●" "○" "◆" "●" "○" "◆")
        org-superstar-item-bullet-alist '((?+ . ?➤) (?- . ?✦))
        org-log-done 'time
        org-hide-emphasis-markers t))

(custom-set-faces
  '(org-level-1 ((t (:inherit outline-1 :height 1.4))))
  '(org-level-2 ((t (:inherit outline-2 :height 1.3))))
  '(org-level-3 ((t (:inherit outline-3 :height 1.2))))
  '(org-level-4 ((t (:inherit outline-4 :height 1.1))))
  '(org-level-5 ((t (:inherit outline-5 :height 1.0))))
)
