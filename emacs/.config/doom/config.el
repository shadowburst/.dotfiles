(setq doom-theme 'doom-one)

(add-to-list 'default-frame-alist '(alpha . 80))

(setq doom-font (font-spec :family "JetBrainsMono Nerd Font" :size 14)
      doom-big-font (font-spec :family "JetBrainsMono Nerd Font" :size 24)
      doom-unicode-font (font-spec :family "JetBrainsMono Nerd Font")
      doom-variable-pitch-font (font-spec :family "JetBrainsMono Nerd Font" :size 14))
(after! doom-themes
  (setq doom-themes-enable-bold t
        doom-themes-enable-italic t))
(custom-set-faces!
  '(font-lock-comment-face :slant italic)
  '(font-lock-keyword-face :slant italic))

(map! :n  "C-s" #'save-buffer
      :iv "C-s" (cmd! (save-buffer)
                      (evil-force-normal-state)))

(map! :i "C-S-v" #'evil-paste-after
      :v "C-S-c" #'evil-yank)

(map! :after evil-org
      :map evil-org-mode-map
      :niv "M-j" nil
      :niv "M-k" nil)
(map! :niv "M-j" #'drag-stuff-down
      :niv "M-k" #'drag-stuff-up)

(add-to-list 'auto-mode-alist '("\\.yuck\\'" . lisp-mode))

(setq display-line-numbers-type 'relative)
(setq evil-escape-unordered-key-sequence t
      evil-split-window-below t
      evil-vsplit-window-right t)

(global-auto-revert-mode 1)
(setq global-auto-revert-non-file-buffers t)

(setq user-full-name "Peter Baudry")

(setq avy-all-windows t
      avy-single-candidate-jump nil)

(map! :after evil-snipe
      :map evil-snipe-mode-map
      :n "s" nil
      :n "S" nil)

(map! :n "s" #'evil-avy-goto-char-timer
      :n "S" #'evil-jump-backward)

(after! sh-script
  (set-company-backend! 'sh-mode
    '(company-shell :with company-yasnippet)))

(add-hook 'dired-mode-hook 'all-the-icons-dired-mode)

(setq delete-by-moving-to-trash t
      trash-directory "~/.local/share/Trash/files/")

(defun empty-trash ()
  (interactive)
  (shell-command "rm -rf $HOME/.local/share/Trash/files")
  (shell-command "mkdir -p $HOME/.local/share/Trash/files"))

(setq dired-open-extensions '(("gif" . "feh")
                              ("jpg" . "feh")
                              ("png" . "feh")
                              ("docx" . "onlyoffice")
                              ("pdf" . "brave")
                              ("mkv" . "mpv")
                              ("avi" . "mpv")
                              ("mp4" . "mpv")))

(setq ranger-cleanup-eagerly t
      ranger-show-hidden 'hidden
      ranger-hide-cursor nil
      ranger-preview-file nil)

(map! :after dired
      :map (dired-mode-map ranger-mode-map)
      :g "a" #'dired-create-empty-file
      :g "A" #'dired-create-directory
      :g "l" #'dired-open-file)

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
  '(org-level-5 ((t (:inherit outline-5 :height 1.0)))))

(use-package! org-auto-tangle
  :defer t
  :hook (org-mode . org-auto-tangle-mode))

(define-globalized-minor-mode global-rainbow-mode rainbow-mode
  (lambda () (unless (eq major-mode '+doom-dashboard-mode) (rainbow-mode 1))))

(global-rainbow-mode 1)

(setq doom-themes-treemacs-theme "doom-colors")

(with-eval-after-load 'doom-themes
  (doom-themes-treemacs-config))

(after! treemacs
  (setq treemacs-default-visit-action 'treemacs-visit-node-close-treemacs
        treemacs-collapse-dirs 5
        treemacs-expand-after-init nil
        treemacs-expand-added-projects nil
        treemacs-show-cursor t
        treemacs-git-mode 'deferred))

(treemacs-project-follow-mode 1)

(after! (:and doom-themes treemacs)
  (set-face-foreground 'treemacs-git-modified-face (doom-color 'orange))
  (set-face-foreground 'treemacs-git-renamed-face (doom-color 'orange)))

(map! :leader
      :desc "Open Treemacs" "e" #'treemacs)

(map! :after treemacs
      :map treemacs-mode-map
      :g "a" #'treemacs-create-file
      :g "A" #'treemacs-create-dir)

(setq shell-file-name "/usr/bin/fish")

(map! :niv "C-²" #'+vterm/toggle)

(map! :map vterm-mode-map
      :i "C-S-v" #'vterm-yank)
