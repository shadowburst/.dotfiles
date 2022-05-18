from __future__ import (absolute_import, division, print_function)

from ranger.colorschemes.default import Default
from ranger.gui.color import blue, default, green, DEFAULT_BACKGROUND


class Scheme(Default):
    progress_bar_color = blue

    def use(self, context):  # pylint: disable=too-many-branches,too-many-statements
        fg, bg, attr = Default.use(self, context)

        if context.in_titlebar and context.tab and context.good:
            fg = green
            bg = default

        return fg, bg, attr
